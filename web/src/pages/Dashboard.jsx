// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import api from '../api/axios';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, ArcElement, BarElement, Tooltip, Legend } from 'chart.js';
import { format, parseISO } from 'date-fns';
import { palette, categorical, commonOptions } from '../chart/theme';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, ArcElement, BarElement, Tooltip, Legend);

export default function Dashboard() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);

	const { user } = useAuth();

	async function processExpired() {
		try {
			const { data: res } = await api.post('/lots/expire');
			toast.success(`Périmés traités · lots: ${res.lotsProcessed} · pertes: ${Number(res.totalLoss).toFixed(3)}`);
			await load(); // recharge les KPI + charts
		} catch (e) { /* l’intercepteur axios affiche déjà l’erreur */ }
	}

	async function load() {
		setLoading(true);
		const { data } = await api.get('/dashboard/overview', { params: { days: 30 } });
		setData(data); setLoading(false);
	}
	useEffect(() => { load(); }, []);

	if (loading) return <Layout><div className="text-slate-500">Loading…</div></Layout>;
	if (!data) return <Layout><div className="text-red-600">No data</div></Layout>;

	const { kpis, series, topProducts, expiringLots, expiredRows, lowStock } = data;

	// === Line chart (IN/OUT/ADJ/LOSS-other/EXPIRED) ===
	const days = Array.from(new Set(series.map(s => s.d))).sort();
	const types = ['IN', 'OUT', 'ADJUSTMENT', 'LOSS', 'EXPIRED'];
	const byType = t => days.map(d => {
		const row = series.find(s => s.d === d && s.t === t);
		return row ? Number(row.qty) : 0;
	});
	const lineData = {
		labels: days.map(d => format(parseISO(d), 'dd/MM')),
		datasets: [
			{ label: 'IN', data: byType('IN'), borderColor: palette.in.border, backgroundColor: palette.in.bg, borderWidth: 2, tension: 0.25 },
			{ label: 'OUT', data: byType('OUT'), borderColor: palette.out.border, backgroundColor: palette.out.bg, borderWidth: 2, tension: 0.25 },
			{ label: 'ADJUSTMENT', data: byType('ADJUSTMENT'), borderColor: palette.adj.border, backgroundColor: palette.adj.bg, borderWidth: 2, tension: 0.25 },
			{ label: 'LOSS (other)', data: byType('LOSS'), borderColor: palette.loss.border, backgroundColor: palette.loss.bg, borderWidth: 2, tension: 0.25 },
			{ label: 'EXPIRED', data: byType('EXPIRED'), borderColor: palette.exp.border, backgroundColor: palette.exp.bg, borderWidth: 2, tension: 0.25 },
		]
	};

	// === Doughnut (IN/OUT/ADJ/LOSS-other/EXPIRED) ===
	console.log(kpis)
	const doughLabels = ['IN', 'OUT', 'ADJ', 'LOSS (other)', 'EXPIRED'];
	const doughValues = [
		kpis.totals_30d.IN,
		kpis.totals_30d.OUT,
		kpis.totals_30d.ADJUSTMENT,
		kpis.totals_30d.LOSS,
		kpis.totals_30d.EXPIRED
	];
	const doughColors = [
		palette.in.border, palette.out.border, palette.adj.border, palette.loss.border, palette.exp.border
	];
	const doughData = { labels: doughLabels, datasets: [{ data: doughValues, backgroundColor: doughColors }] };
	console.log("doughData ", doughData)

	// === Bar top produits OUT ===
	const barData = {
		labels: topProducts.map(p => p.name),
		datasets: [{ label: 'OUT (30j)', data: topProducts.map(p => p.qty), backgroundColor: topProducts.map((_, i) => categorical[i % categorical.length]) }]
	};

	return (
		<Layout>
			<h1 className="text-2xl font-semibold mb-4">Dashboard</h1>

			{/* KPI cards */}
			<div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
				<Card title="Valeur de stock" value={`${kpis.stock_value.toFixed(2)} €`} />
				<Card title="Lots ≤ 7j" value={kpis.lots_expiring_7} />
				<Card title="Lots ≤ 14j" value={kpis.lots_expiring_14} />
				{/* <Card title="Lots périmés (à traiter)" value={kpis.lots_expired_now} /> */}
				<div className="bg-white rounded shadow p-4">
    <div className="text-sm text-slate-500 flex items-center justify-between">
      <span>Lots périmés (à traiter)</span>
      {user?.role === 'ADMIN' && (
        <button onClick={processExpired} className="text-xs px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-700">
          Traiter
        </button>
      )}
    </div>
    <div className="text-2xl font-semibold">{kpis.lots_expired_now}</div>
  </div>
				<Card title="Taux de perte (30j)" value={`${(kpis.loss_rate_30d * 100).toFixed(1)}%`} />
				<Card title="Part expirations dans pertes (30j)" value={`${(kpis.expired_share_of_loss_30d * 100).toFixed(1)}%`} />
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
				<div className="bg-white rounded shadow p-4 lg:col-span-2">
					<div className="font-semibold mb-2">Mouvements (30j)</div>
					<Line data={lineData} options={commonOptions} />
				</div>
				<div className="bg-white rounded shadow p-4">
					<div className="font-semibold mb-2">Répartition 30j</div>
					<Doughnut data={doughData} options={{ ...commonOptions, scales: undefined }} />
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<div className="bg-white rounded shadow p-4">
					<div className="font-semibold mb-2">Top produits consommés (30j)</div>
					<Bar data={barData} options={commonOptions} />
				</div>

				{/* Produits à réapprovisionner */}
				<div className="bg-white rounded shadow p-4">
					<div className="font-semibold mb-2">Produits à alerter / réapprovisionner</div>
					<table className="min-w-full text-sm">
						<thead className="bg-slate-100">
							<tr>
								<th className="text-left px-3 py-2">Produit</th>
								<th className="text-right px-3 py-2">Disponible</th>
								<th className="text-right px-3 py-2">Seuil</th>
								<th className="text-right px-3 py-2">Déficit</th>
							</tr>
						</thead>
						<tbody>
							{lowStock.map(r => {
								const deficit = Math.max(0, Number(r.alert_threshold) - Number(r.available));
								return (
									<tr key={r.id} className="border-t">
										<td className="px-3 py-2">{r.name} <span className="text-slate-400 text-xs">({r.unit})</span></td>
										<td className="px-3 py-2 text-right">{Number(r.available).toFixed(3)}</td>
										<td className="px-3 py-2 text-right">{Number(r.alert_threshold).toFixed(3)}</td>
										<td className={`px-3 py-2 text-right ${deficit > 0 ? 'text-red-600' : ''}`}>{deficit.toFixed(3)}</td>
									</tr>
								);
							})}
							{!lowStock.length && <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>Aucun produit sous seuil.</td></tr>}
						</tbody>
					</table>
				</div>
			</div>

			{/* Lots proches DLC et Pertes par péremption (30j) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<div className="bg-white rounded shadow p-4">
					<div className="font-semibold mb-2">Lots proches de DLC</div>
					<TableExpiring expiringLots={expiringLots} />
				</div>
				<div className="bg-white rounded shadow p-4">
					<div className="font-semibold mb-2">Pertes par péremption (30j)</div>
					<TableExpired expiredRows={expiredRows} />
				</div>
			</div>
		</Layout>
	);
}

function Card({ title, value }) {
	return (
		<div className="bg-white rounded shadow p-4">
			<div className="text-sm text-slate-500">{title}</div>
			<div className="text-2xl font-semibold">{value}</div>
		</div>
	);
}

function TableExpiring({ expiringLots }) {
	return (
		<table className="min-w-full text-sm">
			<thead className="bg-slate-100">
				<tr>
					<th className="text-left px-3 py-2">Produit</th>
					<th className="text-left px-3 py-2">Batch</th>
					<th className="text-left px-3 py-2">DLC</th>
					<th className="text-right px-3 py-2">Qté</th>
				</tr>
			</thead>
			<tbody>
				{expiringLots.map(l => (
					<tr key={l.id} className="border-t">
						<td className="px-3 py-2">{l.product_name} <span className="text-slate-400 text-xs">({l.unit})</span></td>
						<td className="px-3 py-2">{l.batch_number}</td>
						<td className="px-3 py-2">{String(l.expiry_date).slice(0, 10)}</td>
						<td className="px-3 py-2 text-right">{Number(l.quantity).toFixed(3)}</td>
					</tr>
				))}
				{!expiringLots.length && <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>Rien d’urgent.</td></tr>}
			</tbody>
		</table>
	);
}

function TableExpired({ expiredRows }) {
	return (
		<table className="min-w-full text-sm">
			<thead className="bg-slate-100">
				<tr>
					<th className="text-left px-3 py-2">Date perte</th>
					<th className="text-left px-3 py-2">Produit</th>
					<th className="text-left px-3 py-2">Lot</th>
					<th className="text-left px-3 py-2">DLC</th>
					<th className="text-right px-3 py-2">Qté (LOSS)</th>
				</tr>
			</thead>
			<tbody>
				{expiredRows.map(r => (
					<tr key={r.id} className="border-t">
						<td className="px-3 py-2">{String(r.moved_date).slice(0,10)}</td>
						<td className="px-3 py-2">{r.product_name} <span className="text-slate-400 text-xs">({r.unit})</span></td>
						<td className="px-3 py-2">#{r.lot_id} · {r.batch_number}</td>
						<td className="px-3 py-2">{String(r.expiry_date).slice(0, 10)}</td>
						<td className="px-3 py-2 text-right">{Number(r.qty).toFixed(3)}</td>
					</tr>
				))}
				{!expiredRows.length && <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>Aucune perte par péremption sur la période.</td></tr>}
			</tbody>
		</table>
	);
}
