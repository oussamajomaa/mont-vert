// server/src/routes/dashboard.routes.js
import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { a } from '../utils/async.js';

const r = Router();

r.get('/overview', requireAuth(['ADMIN','KITCHEN','DIRECTOR']), a(async (req, res) => {
  const days = Number(req.query.days || 30);

  // 1) Valeur de stock (actif, non expiré)
  const [[sv]] = await pool.query(
    `SELECT COALESCE(SUM(l.quantity * p.cost),0) AS stock_value
     FROM lot l
     JOIN product p ON p.id=l.product_id
     WHERE l.archived=FALSE AND l.expiry_date >= CURDATE()`
  );

  // 2) Lots qui expirent bientôt
  const [[exp7]]  = await pool.query(
    `SELECT COUNT(*) AS c FROM lot l
     WHERE l.archived=FALSE AND l.quantity>0
       AND l.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`
  );
  const [[exp14]] = await pool.query(
    `SELECT COUNT(*) AS c FROM lot l
     WHERE l.archived=FALSE AND l.quantity>0
       AND l.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)`
  );

  // 2.bis) Lots déjà périmés (à traiter)
  const [[expiredNow]] = await pool.query(
    `SELECT COUNT(*) AS c FROM lot l
     WHERE l.archived=FALSE AND l.quantity>0 AND l.expiry_date < CURDATE()`
  );

  // 3) Répartition des plans
  const [plans] = await pool.query(`SELECT status, COUNT(*) AS c FROM meal_plan GROUP BY status`);
  const planCounts = { DRAFT:0, CONFIRMED:0, EXECUTED:0 };
  for (const p of plans) planCounts[p.status] = Number(p.c);

  // 4) Séries jour/type (IN, OUT, ADJUSTMENT, LOSS-other, EXPIRED)
  const [series] = await pool.query(
    `SELECT DATE(moved_at) AS d,
            CASE
              WHEN type='LOSS' AND reason='EXPIRED' THEN 'EXPIRED'
              WHEN type='LOSS' AND (reason IS NULL OR reason<>'EXPIRED') THEN 'LOSS'
              ELSE type
            END AS t,
            ROUND(SUM(quantity),3) AS qty
     FROM stock_movement
     WHERE moved_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(moved_at), t
     ORDER BY d ASC`, [days]
  );

  // 5) Totaux 30j (même logique de regroupement)
  const [totals] = await pool.query(
    `SELECT
       CASE
         WHEN type='LOSS' AND reason='EXPIRED' THEN 'EXPIRED'
         WHEN type='LOSS' AND (reason IS NULL OR reason<>'EXPIRED') THEN 'LOSS'
         ELSE type
       END AS t,
       ROUND(SUM(quantity),3) AS qty
     FROM stock_movement
     WHERE moved_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY t`, [days]
  );
  const tmap = { IN:0, OUT:0, ADJUSTMENT:0, LOSS:0, EXPIRED:0 };
  for (const t of totals) tmap[t.t] = Number(t.qty);

  // Taux de perte réajusté = (LOSS + EXPIRED) / (OUT + LOSS + EXPIRED)
  const denom = tmap.OUT + tmap.LOSS + tmap.EXPIRED;
  const lossRate = denom > 0 ? Number(((tmap.LOSS + tmap.EXPIRED) / denom).toFixed(3)) : 0;
  const expiredShare = (tmap.LOSS + tmap.EXPIRED) > 0
    ? Number((tmap.EXPIRED / (tmap.LOSS + tmap.EXPIRED)).toFixed(3))
    : 0;

  // 6) Top produits consommés (OUT)
  const [topProducts] = await pool.query(
    `SELECT p.id, p.name, p.unit, ROUND(SUM(sm.quantity),3) AS qty
     FROM stock_movement sm
     JOIN lot l ON l.id=sm.lot_id
     JOIN product p ON p.id=l.product_id
     WHERE sm.type='OUT' AND sm.moved_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY p.id, p.name, p.unit
     ORDER BY qty DESC
     LIMIT 8`, [days]
  );

  // 7) Lots proches de DLC (pas périmés)
  const [expiringLots] = await pool.query(
    `SELECT l.id, l.batch_number, l.expiry_date, l.quantity,
            p.name AS product_name, p.unit
     FROM lot l
     JOIN product p ON p.id=l.product_id
     WHERE l.archived=FALSE AND l.quantity>0
       AND l.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 21 DAY)
     ORDER BY l.expiry_date ASC, l.id ASC
     LIMIT 20`
  );

  // 8) Pertes liées aux expirations (tableau 30j)
  const [expiredRows] = await pool.query(
    `SELECT m.id, DATE(m.moved_at) AS moved_date, ROUND(m.quantity,3) AS qty,
            l.id AS lot_id, l.batch_number, l.expiry_date,
            p.name AS product_name, p.unit
     FROM stock_movement m
     JOIN lot l ON l.id = m.lot_id
     JOIN product p ON p.id = l.product_id
     WHERE m.type='LOSS' AND m.reason='EXPIRED'
       AND m.moved_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY m.moved_at DESC, m.id DESC
     LIMIT 100`, [days]
  );

  // 9) Produits en alerte / réappro (stock "available" <= alert_threshold)
  const [lowStock] = await pool.query(
    `WITH res AS (
       SELECT lot_id, SUM(reserved_qty) AS reserved
       FROM reservation rv
       JOIN meal_plan_item mi ON mi.id = rv.meal_plan_item_id
       JOIN meal_plan mp ON mp.id = mi.meal_plan_id
       WHERE mp.status='CONFIRMED' AND mi.produced_portions IS NULL
       GROUP BY lot_id
     )
     SELECT p.id, p.name, p.unit, p.alert_threshold,
            ROUND(COALESCE(SUM(GREATEST(0, l.quantity - IFNULL(res.reserved,0))),0),3) AS available
     FROM product p
     LEFT JOIN lot l ON l.product_id=p.id
                     AND l.archived=FALSE
                     AND l.expiry_date >= CURDATE()
     LEFT JOIN res ON res.lot_id = l.id
     WHERE p.active=TRUE
     GROUP BY p.id, p.name, p.unit, p.alert_threshold
     HAVING p.alert_threshold > 0 AND available <= p.alert_threshold
     ORDER BY (CASE WHEN p.alert_threshold>0 THEN available/p.alert_threshold ELSE 1 END) ASC
     LIMIT 20`
  );

  res.json({
    kpis: {
      stock_value: Number(sv.stock_value),
      lots_expiring_7: Number(exp7.c),
      lots_expiring_14: Number(exp14.c),
      lots_expired_now: Number(expiredNow.c),
      plans: planCounts,
      totals_30d: tmap,             // {IN, OUT, ADJUSTMENT, LOSS, EXPIRED}
      loss_rate_30d: lossRate,      // (LOSS+EXPIRED)/(OUT+LOSS+EXPIRED)
      expired_share_of_loss_30d: expiredShare // EXPIRED/(LOSS+EXPIRED)
    },
    series,              // d, t in {IN, OUT, ADJUSTMENT, LOSS, EXPIRED}, qty
    topProducts,         // top OUT
    expiringLots,        // lots proches DLC
    expiredRows,         // pertes EXPIRED 30j (tableau)
    lowStock,            // produits à alerter (available <= threshold)
    days
  });
}));

export default r;
