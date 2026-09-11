'use client';

import { useEffect, useState } from 'react';

type Service = {
  id: string;
  name: string;
  category: string;
  min: number;
  max: number;
  pricePer1000: number;
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`/api/services?q=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setServices(data.services))
      .catch((e) => {
        if (e.name !== 'AbortError') setError('Gagal memuat daftar service. Coba lagi.');
      });
    return () => controller.abort();
  }, [q]);

  return (
    <>
      <h1>Services</h1>
      <p className="subtitle">Pilih service untuk membuat order baru.</p>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Cari service..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <div className="error-state">{error}</div>}
      {!error && services === null && <div className="empty-state">Memuat service...</div>}
      {!error && services?.length === 0 && <div className="empty-state">Tidak ada service yang cocok.</div>}

      {services && services.length > 0 && (
        <div>
          {services.map((s) => (
            <a key={s.id} className="service-row" href={`/services/${s.id}`}>
              <div>
                <div className="service-name">{s.name}</div>
                <div className="service-meta">
                  {s.category} · min {s.min.toLocaleString('id-ID')} · max {s.max.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="service-price">
                {s.pricePer1000.toLocaleString('id-ID')} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/1000</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
