'use client';

import { useEffect, useState } from 'react';

// Phase 1 has no auth, so this demo view lists all orders. In Phase 2,
// filter by the authenticated userId instead.
type Order = {
  id: string;
  status: string;
  quantity: number | null;
  customerPrice: number;
  createdAt: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    fetch('/api/orders/list')
      .then((r) => r.json())
      .then((data) => setOrders(data.orders))
      .catch(() => setOrders([]));
  }, []);

  return (
    <>
      <h1>Orders</h1>
      <p className="subtitle">Riwayat order Anda.</p>

      {orders === null && <div className="empty-state">Memuat...</div>}
      {orders?.length === 0 && <div className="empty-state">Belum ada order. Mulai dari halaman Services.</div>}

      {orders && orders.length > 0 && (
        <div>
          {orders.map((o) => (
            <a key={o.id} className="service-row" href={`/orders/${o.id}`}>
              <div>
                <div className="service-name">Order #{o.id.slice(-6)}</div>
                <div className="service-meta">{o.quantity?.toLocaleString('id-ID')} unit · {new Date(o.createdAt).toLocaleDateString('id-ID')}</div>
              </div>
              <span className={`badge status-${o.status.toLowerCase()}`}>{o.status}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
