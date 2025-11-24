// src/pages/MealPlans.jsx
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import api from '../api/axios';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

export default function MealPlans() {
    const [plans, setPlans] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('');
    const [openCreate, setOpenCreate] = useState(false);

    async function load(p = page) {
        const { data } = await api.get('/meal-plans', { params: { page: p, pageSize, status: status || undefined } });
        setPlans(data.data); setTotal(data.total); setPage(data.page);
    }
    useEffect(() => { load(1); }, [status]);

    const { register, handleSubmit, reset } = useForm({ defaultValues: { period_start: '', period_end: '' } });
    async function onCreate(values) {
        const payload = { period_start: values.period_start, period_end: values.period_end, items: [] };
        const { data } = await api.post('/meal-plans', payload);
        setOpenCreate(false); reset({ period_start: '', period_end: '' });
        await load(1);
    }

    return (
        <Layout>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold">Meal Plans</h1>
                <div className="flex items-center gap-2">
                    <select value={status} onChange={e => setStatus(e.target.value)} className="border rounded px-3 py-2">
                        <option value="">All</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="EXECUTED">EXECUTED</option>
                    </select>
                    <button onClick={() => setOpenCreate(true)} className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700">New plan</button>
                </div>
            </div>

            <div className="bg-white rounded shadow overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100">
                        <tr>
                            <th className="text-left px-3 py-2">ID</th>
                            <th className="text-left px-3 py-2">Period</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-right px-3 py-2"># Items</th>
                            <th className="px-3 py-2 w-40">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {plans.map(p => (
                            <tr key={p.id} className="border-t">
                                <td className="px-3 py-2">{p.id}</td>
                                <td className="px-3 py-2">{p.period_start.slice(0,10)} 🗓️ {p.period_end.slice(0,10)}</td>
                                <td className="px-3 py-2">{p.status}</td>
                                <td className="px-3 py-2 text-right">{p.items_count}</td>
                                <td className="px-3 py-2">
                                    <div className="flex justify-end">
                                        <Link to={`/meal-plans/${p.id}`} className="px-3 py-1 rounded border hover:bg-slate-50">View</Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!plans.length && <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>No plans.</td></tr>}
                    </tbody>
                </table>
                <div className="p-3 border-t bg-slate-50">
                    <Pagination page={page} pageSize={pageSize} total={total} onChange={(p) => load(p)} />
                </div>
            </div>

            {/* MODAL: Créer un plan */}
            <Modal
                title="Create plan"
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                footer={
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setOpenCreate(false)} className="px-4 py-2 rounded border">Cancel</button>
                        <button form="createPlanForm" className="px-4 py-2 rounded bg-slate-800 text-white hover:bg-slate-700">Create</button>
                    </div>
                }
            >
                <form id="createPlanForm" onSubmit={handleSubmit(onCreate)} className="space-y-3">
                    <div>
                        <label className="block text-sm">Period start</label>
                        <input type="date" {...register('period_start', { required: true })} className="w-full border rounded px-3 py-2" />
                    </div>
                    <div>
                        <label className="block text-sm">Period end</label>
                        <input type="date" {...register('period_end', { required: true })} className="w-full border rounded px-3 py-2" />
                    </div>
                </form>
            </Modal>
        </Layout>
    );
}
