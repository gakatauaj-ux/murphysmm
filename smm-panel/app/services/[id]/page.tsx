'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Service = {
  id: string;
  name: string;
  category: string;
  description?: string;
  min: number;
  max: number;
  requiredParams: string[];
  pricePer1000: number;
};

export default function ServiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then((data) => {
        const found = (data.services as Service[]).find((s) => s.id === params.id);
        if (!found) setError('Service tidak ditemukan.');
        else setService(found);
      })
      .catch(() => setError('Gagal memuat service.'));
  }, [params.id]);

  if (error) return <div className="error-state">{error}</div>;
  if (!service) return <div className="empty-state">Memuat...</div>;

  const qtyNum = typeof quantity === 'number' ? quantity : 0;
  const estimatedPrice = qtyNum > 0 ? ((service.pricePer1000 / 1000) * qtyNum) : 0;
  const needsLink = service.requiredParams.includes('link');

  async function submitOrder() {
    setSubmitError(null);
    if (needsLink && !link) {
      setSubmitError('Link wajib diisi untuk service ini.');
      return;
    }
    if (!qtyNum || qtyNum < service!.min || qtyNum > service!.max) {
      setSubmitError(`Quantity harus antara ${service!.min} dan ${service!.max}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service!.id,
          idempotencyKey: crypto.randomUUID(),
          link: needsLink ? link : undefined,
          quantity: qtyNum,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Order gagal dibuat.');
        setSubmitting(false);
        return;
      }
      router.push(`/orders/${data.order.id}`);
    } catch {
      setSubmitError('Terjadi kesalahan jaringan. Coba lagi.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>{service.name}</h1>
      <p className="subtitle">{service.category}</p>
      {service.description && <p style={{ marginBottom: 24 }}>{service.description}</p>}

      {needsLink && (
        <div className="field">
          <label>Link / Target</label>
          <input className="input" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
      )}

      <div className="field">
        <label>Quantity (min {service.min.toLocaleString('id-ID')}, max {service.max.toLocaleString('id-ID')})</label>
        <input
          className="input"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>

      <div className="price-line">
        <span>Estimasi harga</span>
        <strong>{estimatedPrice > 0 ? estimatedPrice.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '—'}</strong>
      </div>

      {submitError && <div className="error-state" style={{ padding: '12px 0', textAlign: 'left' }}>{submitError}</div>}

      <button className="btn primary" onClick={submitOrder} disabled={submitting} style={{ marginTop: 12 }}>
        {submitting ? 'Memproses...' : 'Buat Order'}
      </button>
    </>
  );
}
