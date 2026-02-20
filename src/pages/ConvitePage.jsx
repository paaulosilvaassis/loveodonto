import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Section } from '../components/Section.jsx';
import { Field } from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import { getInvitationByToken, acceptInvitation } from '../services/invitationService.js';
import { MEMBERSHIP_ROLE_LABELS } from '../constants/tenantRoles.js';

export default function ConvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const token = searchParams.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvitation(null);
      setLoading(false);
      return;
    }
    const inv = getInvitationByToken(token);
    setInvitation(inv || null);
    if (inv) setEmail(inv.email || '');
    setLoading(false);
  }, [token]);

  const handleAccept = async (e) => {
    e.preventDefault();
    setError('');
    setAccepting(true);
    try {
      const result = acceptInvitation(token, {
        userId: user?.id,
        email: email.trim() || invitation?.email,
        name: (name || '').trim() || undefined,
      });
      if (user?.id === result.userId) {
        navigate('/gestao/dashboard', { replace: true });
        return;
      }
      login({ userId: result.userId, tenantId: result.tenantId });
      navigate('/gestao/dashboard', { replace: true });
    } catch (err) {
      setError(err?.message || 'Erro ao aceitar convite.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="stack" style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="muted">Carregando...</p>
      </div>
    );
  }

  if (!token || !invitation) {
    return (
      <div className="stack" style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }}>
        <Section title="Convite inválido">
          <p className="muted">Este link de convite não existe ou expirou.</p>
          <Button variant="secondary" onClick={() => navigate('/login', { replace: true })}>
            Ir para o login
          </Button>
        </Section>
      </div>
    );
  }

  const isLoggedIn = !!user;
  const emailNorm = (email || invitation.email || '').trim().toLowerCase();

  return (
    <div className="stack" style={{ maxWidth: '420px', margin: '0 auto', padding: '2rem' }}>
      <Section
        title="Convite para acessar a clínica"
        description={`Você foi convidado a acessar o sistema com o perfil ${MEMBERSHIP_ROLE_LABELS[invitation.role] || invitation.role}.`}
      >
        <p className="muted" style={{ marginBottom: '1rem' }}>
          E-mail do convite: <strong>{invitation.email}</strong>
        </p>

        {isLoggedIn ? (
          <>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Você está logado como <strong>{user.name}</strong>. Ao aceitar, este usuário será vinculado à clínica.
            </p>
            {error && <div className="error">{error}</div>}
            <Button variant="primary" onClick={handleAccept} disabled={accepting}>
              {accepting ? 'Aceitando…' : 'Aceitar convite e entrar'}
            </Button>
          </>
        ) : (
          <form onSubmit={handleAccept} className="stack">
            <Field label="Seu nome">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
              />
            </Field>
            {error && <div className="error">{error}</div>}
            <Button type="submit" variant="primary" disabled={accepting || !emailNorm}>
              {accepting ? 'Aceitando…' : 'Aceitar convite e entrar'}
            </Button>
          </form>
        )}
      </Section>
    </div>
  );
}
