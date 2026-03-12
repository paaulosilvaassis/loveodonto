/**
 * Página Base de Suporte - listagem por abas (Pendentes, Concluídos, Cancelados, Avaliações).
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import SupportTabs, { SUPPORT_TAB_KEYS } from '../../components/support/SupportTabs.jsx';
import SupportTicketCard from '../../components/support/SupportTicketCard.jsx';
import SupportTicketModal from '../../components/support/SupportTicketModal.jsx';
import SupportRatingModal from '../../components/support/SupportRatingModal.jsx';
import SupportIcon from '../../components/support/SupportIcon.jsx';
import { loadDb } from '../../db/index.js';
import {
  getTicketsByUser,
  cancelTicket,
  rateTicket,
  updateTicketStatus,
  SUPPORT_STATUS,
} from '../../services/supportTicketService.js';

export default function SupportPage() {
  const session = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('appgestaoodonto.session') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [activeTab, setActiveTab] = useState(SUPPORT_TAB_KEYS.PENDENTES);
  const [refresh, setRefresh] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [ratingTicket, setRatingTicket] = useState(null);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const db = loadDb() || { clinicProfile: {} };
  const userId = session?.userId;
  const clinicId = db?.clinicProfile?.id;

  const tickets = useMemo(() => {
    if (!userId) return [];
    return getTicketsByUser(userId);
  }, [userId, refresh]);

  const { pendentes, concluidos, cancelados, avaliacoes } = useMemo(() => {
    const p = tickets.filter(
      (t) => t.status === SUPPORT_STATUS.OPEN || t.status === SUPPORT_STATUS.SCHEDULED
    );
    const c = tickets.filter((t) => t.status === SUPPORT_STATUS.CLOSED);
    const canc = tickets.filter((t) => t.status === SUPPORT_STATUS.CANCELLED);
    const av = tickets.filter((t) => t.rating != null && t.rating > 0);
    return {
      pendentes: p.length,
      concluidos: c.length,
      cancelados: canc.length,
      avaliacoes: av.length,
    };
  }, [tickets]);

  const counts = { pendentes, concluidos, cancelados, avaliacoes };

  const filteredTickets = useMemo(() => {
    if (activeTab === SUPPORT_TAB_KEYS.PENDENTES) {
      return tickets
        .filter(
          (t) =>
            t.status === SUPPORT_STATUS.OPEN || t.status === SUPPORT_STATUS.SCHEDULED
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (activeTab === SUPPORT_TAB_KEYS.CONCLUIDOS) {
      return tickets
        .filter((t) => t.status === SUPPORT_STATUS.CLOSED)
        .sort((a, b) => new Date(b.closed_at || b.created_at) - new Date(a.closed_at || a.created_at));
    }
    if (activeTab === SUPPORT_TAB_KEYS.CANCELADOS) {
      return tickets
        .filter((t) => t.status === SUPPORT_STATUS.CANCELLED)
        .sort((a, b) => new Date(b.cancelled_at || b.created_at) - new Date(a.cancelled_at || a.created_at));
    }
    if (activeTab === SUPPORT_TAB_KEYS.AVALIACOES) {
      return tickets
        .filter((t) => t.rating != null && t.rating > 0)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return [];
  }, [tickets, activeTab]);

  const handleCreateSuccess = (ticket) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({
      message: `Chamado aberto. Protocolo: ${ticket.protocol}`,
      type: 'success',
    });
    setCreateModalOpen(false);
    setRefresh((r) => r + 1);
    toastRef.current = setTimeout(() => {
      setToast(null);
      toastRef.current = null;
    }, 4000);
  };

  const handleComplete = (ticket) => {
    try {
      updateTicketStatus(ticket.id, SUPPORT_STATUS.CLOSED, userId);
      setRefresh((r) => r + 1);
      if (toastRef.current) clearTimeout(toastRef.current);
      setToast({ message: 'Chamado marcado como concluído.', type: 'success' });
      toastRef.current = setTimeout(() => setToast(null), 4000);
    } catch (err) {
      if (toastRef.current) clearTimeout(toastRef.current);
      setToast({ message: err?.message || 'Erro.', type: 'error' });
      toastRef.current = setTimeout(() => setToast(null), 4000);
    }
  };

  const handleCancel = (ticket) => {
    try {
      cancelTicket(ticket.id, userId);
      setRefresh((r) => r + 1);
      if (toastRef.current) clearTimeout(toastRef.current);
      setToast({ message: 'Chamado cancelado.', type: 'success' });
      toastRef.current = setTimeout(() => setToast(null), 4000);
    } catch (err) {
      if (toastRef.current) clearTimeout(toastRef.current);
      setToast({ message: err?.message || 'Erro ao cancelar.', type: 'error' });
      toastRef.current = setTimeout(() => setToast(null), 4000);
    }
  };

  const handleRateClick = (ticket) => {
    setRatingTicket(ticket);
    setRatingModalOpen(true);
  };

  const handleRateSubmit = (ticketId, rating, feedback) => {
    rateTicket(ticketId, rating, feedback, userId);
    setRefresh((r) => r + 1);
    setRatingModalOpen(false);
    setRatingTicket(null);
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ message: 'Avaliação enviada com sucesso!', type: 'success' });
    toastRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => () => {
    if (toastRef.current) clearTimeout(toastRef.current);
  }, []);

  return (
    <div className="support-page">
      <div className="support-page-header section-header">
        <div>
          <h1 className="support-page-title">
            <SupportIcon size={28} variant="minimal" />
            Base de Suporte
          </h1>
          <p className="support-page-subtitle">
            Acompanhe seus chamados e avalie o atendimento.
          </p>
        </div>
        <button
          type="button"
          className="support-page-create-btn"
          onClick={() => setCreateModalOpen(true)}
          aria-label="Abrir novo chamado"
        >
          <Plus size={20} />
          Abrir Chamado
        </button>
      </div>

      <SupportTabs
        activeTab={activeTab}
        counts={counts}
        onChange={setActiveTab}
      />

      <div
        id={`support-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`support-tab-${activeTab}`}
        className="support-page-panel"
      >
        {filteredTickets.length === 0 ? (
          <p className="support-page-empty">
            Nenhum chamado nesta categoria.
          </p>
        ) : (
          <div className="support-page-grid">
            {filteredTickets.map((ticket) => (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                tab={activeTab}
                onCancel={handleCancel}
                onComplete={handleComplete}
                onRate={handleRateClick}
              />
            ))}
          </div>
        )}
      </div>

      <SupportTicketModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        userId={userId}
        clinicId={clinicId}
        onSuccess={handleCreateSuccess}
      />

      <SupportRatingModal
        open={ratingModalOpen}
        ticket={ratingTicket}
        onClose={() => {
          setRatingModalOpen(false);
          setRatingTicket(null);
        }}
        onSubmit={handleRateSubmit}
      />

      {toast && (
        <div
          className={`toast support-toast ${toast.type}`}
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 10000,
            maxWidth: 360,
            padding: '12px 16px',
            borderRadius: 12,
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
