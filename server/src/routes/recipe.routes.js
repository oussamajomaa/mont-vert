import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { a } from '../utils/async.js';

const r = Router();

// LIST paginée + recherche
r.get('/', requireAuth(), a(async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page || '1', 10));
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '10', 10)));
	const q = (req.query.q || '').trim();

	const where = [];
	const params = [];
	if (q) { where.push('r.name LIKE ?'); params.push(`%${q}%`); }

	const base = `FROM recipe r ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
	const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) AS cnt ${base}`, params);

	const offset = (page - 1) * pageSize;
	const [rows] = await pool.query(
		`SELECT r.*,
            (SELECT COUNT(*) FROM recipe_item ri WHERE ri.recipe_id = r.id) AS items_count
     ${base}
     ORDER BY r.name
     LIMIT ? OFFSET ?`,
		[...params, pageSize, offset]
	);

	res.json({ data: rows, total: cnt, page, pageSize });
}))

// ITEMS d'une recette
r.get('/:id/items', requireAuth(), a(async (req, res) => {
	const [rows] = await pool.query(
		`SELECT ri.id, ri.product_id, p.name AS product_name, p.unit, ri.qty_per_portion
     FROM recipe_item ri JOIN product p ON p.id=ri.product_id
     WHERE ri.recipe_id=? ORDER BY ri.id`, [req.params.id]
	);
	res.json(rows);
}));

// CREATE (recette + items)
r.post('/', requireAuth(['ADMIN']), a(async (req, res) => {
	const { name, base_portions, waste_rate = 0, items = [] } = req.body;
	const conn = await pool.getConnection(); await conn.beginTransaction();
	try {
		const [ins] = await conn.query(
			'INSERT INTO recipe (name, base_portions, waste_rate) VALUES (?,?,?)',
			[name, base_portions, waste_rate]
		);
		const recipeId = ins.insertId;
		for (const it of items) {
			await conn.query(
				'INSERT INTO recipe_item (recipe_id, product_id, qty_per_portion) VALUES (?,?,?)',
				[recipeId, it.product_id, it.qty_per_portion]
			);
		}
		await conn.commit(); conn.release();
		res.status(201).json({ id: recipeId });
	} catch (e) { await conn.rollback(); conn.release(); throw e; }
}));

// UPDATE (remplace les items)
r.patch('/:id', requireAuth(['ADMIN']), a(async (req, res) => {
	const { id } = req.params;
	const { name, base_portions, waste_rate, items } = req.body;
	const conn = await pool.getConnection(); await conn.beginTransaction();
	try {
		const sets = [], vals = [];
		if (name !== undefined) { sets.push('name=?'); vals.push(name); }
		if (base_portions !== undefined) { sets.push('base_portions=?'); vals.push(base_portions); }
		if (waste_rate !== undefined) { sets.push('waste_rate=?'); vals.push(waste_rate); }
		if (sets.length) await conn.query(`UPDATE recipe SET ${sets.join(', ')} WHERE id=?`, [...vals, id])

		if (Array.isArray(items)) {
			await conn.query('DELETE FROM recipe_item WHERE recipe_id=?', [id]);
			for (const it of items) {
				await conn.query(
					'INSERT INTO recipe_item (recipe_id, product_id, qty_per_portion) VALUES (?,?,?)',
					[id, it.product_id, it.qty_per_portion]
				)
			}
		}
		await conn.commit(); conn.release();
		res.json({ message: 'updated' });
	} catch (e) { await conn.rollback(); conn.release(); throw e; }
}));

// DELETE
r.delete('/:id', requireAuth(['ADMIN']), a(async (req, res) => {
	try {
		await pool.query('DELETE FROM recipe WHERE id=?', [req.params.id])
		res.status(204).end();
	} catch (e) {
		if (e?.errno === 1451) return res.status(409).json({ error: 'Cannot delete: recipe in use.' })
		throw e;
	}
}));

export default r
