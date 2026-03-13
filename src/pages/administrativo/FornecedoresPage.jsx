import { useMemo, useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { listSuppliers } from '../../services/suppliersService.js';
import SupplierFormModal from '../../components/SupplierFormModal.jsx';

const normalize = (value) => (value || '').toLowerCase();

const SUPPLIER_CATEGORIES = [
  'Material odontológico',
  'Laboratório',
  'Marketing',
  'Software',
  'Manutenção',
  'Equipamentos',
  'Serviços terceirizados',
  'Utilidades',
  'Limpeza',
  'Administrativo',
  'Outros',
];

export default function FornecedoresPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [toast, setToast] = useState(null);

  const suppliers = useMemo(() => listSuppliers(), [refreshKey]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    return suppliers.filter((s) => {
      const status = s.status || 'ativo';
      const category = s.category || '';

      if (statusFilter && status !== statusFilter) return false;
      if (categoryFilter && category !== categoryFilter) return false;

      if (!term) return true;
      const haystack = [
        s.trade_name || s.name,
        s.legal_name,
        s.document,
        s.contact_name || s.contact,
        s.phone,
        s.whatsapp,
      ]
        .filter(Boolean)
        .map(normalize)
        .join(' ');

      return haystack.includes(term);
    });
  }, [suppliers, search, statusFilter, categoryFilter]);

  const total = suppliers.length;
  const active = suppliers.filter((s) => (s.status || 'ativo') === 'ativo').length;
  const inactive = suppliers.filter((s) => s.status === 'inativo').length;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleSupplierSuccess = () => {
    showToast('Fornecedor cadastrado com sucesso.');
    setOpenModal(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="suppliers-page">
      {toast && (
        <div
          className={`toast suppliers-toast ${toast.type}`}
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 10001,
            padding: '12px 20px',
            borderRadius: 12,
            background: toast.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="suppliers-header">
        <h1>
          <Building2 size={22} />
          Fornecedores
        </h1>
        <button
          type="button"
          className="button primary suppliers-new-btn"
          onClick={() => setOpenModal(true)}
        >
          <Plus size={18} />
          Novo fornecedor
        </button>
      </div>

      <div className="suppliers-kpis">
        <div className="suppliers-kpi-card">
          <span className="suppliers-kpi-label">Total de fornecedores</span>
          <strong>{total}</strong>
        </div>
        <div className="suppliers-kpi-card suppliers-kpi-card--active">
          <span className="suppliers-kpi-label">Ativos</span>
          <strong>{active}</strong>
        </div>
        <div className="suppliers-kpi-card suppliers-kpi-card--inactive">
          <span className="suppliers-kpi-label">Inativos</span>
          <strong>{inactive}</strong>
        </div>
        <div className="suppliers-kpi-card">
          <span className="suppliers-kpi-label">Com movimentação financeira</span>
          <strong>—</strong>
        </div>
      </div>

      <div className="suppliers-filters">
        <div className="suppliers-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nome, documento, telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label>
          Categoria
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas</option>
            {SUPPLIER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </label>
      </div>

      <div className="suppliers-table-wrap">
        <table className="suppliers-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Responsável</th>
              <th>Telefone</th>
              <th>Cidade</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhum fornecedor encontrado.</td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id}>
                  <td>{s.trade_name || s.name || '—'}</td>
                  <td>{s.category || '—'}</td>
                  <td>{s.contact_name || s.contact || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.city || '—'}</td>
                  <td>
                    <span className={`suppliers-status suppliers-status--${s.status || 'ativo'}`}>
                      {(s.status || 'ativo') === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="suppliers-actions">
                    <button type="button" className="button small">
                      Visualizar
                    </button>
                    <button type="button" className="button small secondary">
                      Editar
                    </button>
                    <button type="button" className="button small secondary">
                      Inativar
                    </button>
                    <button type="button" className="button small danger" disabled>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SupplierFormModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onSuccess={handleSupplierSuccess}
        user={user}
      />
    </div>
  );
}

