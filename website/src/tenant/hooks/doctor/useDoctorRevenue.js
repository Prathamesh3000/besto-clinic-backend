import { useState, useCallback } from 'react';
import { listInvoices } from '../../api';
import { formatCurrency, sixMonthsAgoISO } from '../../components/doctor/shared';

export default function useDoctorRevenue(userId) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [consultCount, setConsultCount] = useState(0);
  const [chartData, setChartData] = useState([]);

  const fetchRevenue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listInvoices({ doctor: userId, status: 'paid', from: sixMonthsAgoISO() });
      const d = res.data || res;
      const list = d.invoices || d.data || [];
      const inv = Array.isArray(list) ? list : [];
      setInvoices(inv);

      const revenueTotal = inv.reduce((sum, i) => sum + (i.total || i.amount || i.grandTotal || 0), 0);
      setTotal(revenueTotal);
      setConsultCount(inv.length);

      // Build monthly chart data
      const months = {};
      inv.forEach((i) => {
        const dt = new Date(i.paidAt || i.createdAt || i.date);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const label = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        if (!months[key]) months[key] = { month: label, revenue: 0 };
        months[key].revenue += (i.total || i.amount || i.grandTotal || 0);
      });
      setChartData(Object.keys(months).sort().map((k) => months[k]));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    invoices,
    loading,
    error,
    total,
    consultCount,
    chartData,
    fetchRevenue,
  };
}
