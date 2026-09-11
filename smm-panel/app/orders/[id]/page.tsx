'use client';

import { useEffect, useState } from 'react';

type Order = {
  id: string;
  status: string;
  link: string | null;
  quantity: number | null;
  customerPrice: number;
  providerOrderId: string | null;
  createdAt: string;
};

const ACTIVE_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'PROCESSING']);

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${params.id}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError('Order tidak ditemukan.');
          return;
        }
        setOrder(data.order);
        // Only keep polling while the order is still active — avoids
        // hammering the status endpoint for orders that are already done.
        if (ACTIVE_STATUSES.has(data.order.status)) {
          timer = setTimeout(poll, 8000);
        }
      } catch {
        if (!cancelled) setError('Gagal memuat status order.');
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.id]);

  if (error) return <div className="error-state">{error}</div>;
  if (!order) return <div className="empty-state">Memuat...</div>;

  return (
    <>
      <h1>Order #{order.id.slice(-6)}</h1>
      <p className="subtitle">Dibuat {new Date(order.createdAt).toLocaleString('id-ID')}</p>

      <div style={{ marginBottom: 20 }}>
        <span className={`badge status-${order.status.toLowerCase()}`}>{order.status}</span>
      </div>

      {order.link && (
        <div className="field">
          <label>Link</label>
          <div>{order.link}</div>
        </div>
      )}
      <div className="field">
        <label>Quantity</label>
        <div>{order.quantity?.toLocaleString('id-ID')}</div>
      </div>

      <div className="price-line">
        <span>Total</span>
        <strong>{order.customerPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</strong>
      </div>

      {ACTIVE_STATUSES.has(order.status) && (
        <p className="subtitle" style={{ marginTop: 16 }}>Status akan diperbarui otomatis.</p>
      )}
    </>
  );
}
