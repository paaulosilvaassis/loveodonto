import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Section } from '../components/Section.jsx';
import { Field } from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import { getDefaultTenant, updateTenant } from '../services/tenantService.js';
import { Check } from 'lucide-react';

export default function OnboardingClinicaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenant = getDefaultTenant();
  const [name, setName] = useState(tenant ? tenant.name : '');
  const [logoUrl, setLogoUrl] = useState(tenant ? tenant.logo_url : '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const trimmed = (name || '').trim();
    if (!trimmed) {
      setError('Nome da clínica é obrigatório.');
      return;
    }
    if (!user || (!user.isMaster && user.role !== 'admin')) {
      setError('Apenas o administrador pode configurar a clínica.');
      return;
    }
    setSaving(true);
    try {
      updateTenant(user, tenant.id, { name: trimmed, logo_url: logoUrl || null });
      setSuccess('Dados salvos. Redirecionando...');
      setTimeout(() => navigate('/gestao/dashboard', { replace: true }), 800);
    } catch (err) {
      setError(err && err.message ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (!tenant) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="muted">Nenhuma clínica encontrada.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem' }}>
      <Section title="Configuração da clínica" description="Informe o nome e o logo da sua clínica.">
        <form onSubmit={handleSubmit} className="stack">
          <Field label="Nome da clínica">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Clínica Sorriso"
              autoFocus
            />
          </Field>
          <Field label="URL do logo (opcional)">
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
            />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          {success ? <div className="success">{success}</div> : null}
          <Button type="submit" variant="primary" icon={Check} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar e continuar'}
          </Button>
        </form>
      </Section>
    </div>
  );
}
