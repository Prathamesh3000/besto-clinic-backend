import { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';
import { getCreditBalance } from '../../api';

export default function CreditBalanceWidget({ className = '' }) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    getCreditBalance()
      .then((r) => setBalance(r.data))
      .catch(() => {});
  }, []);

  if (!balance) return null;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl ${className}`}>
      <Coins className="w-5 h-5 text-amber-600" />
      <span className="text-sm font-semibold text-amber-800">{balance.balance} Credits</span>
    </div>
  );
}
