import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Field } from '../components/Field.jsx';
import { Section } from '../components/Section.jsx';
import {
  createMaterial,
  createPurchase,
  createSupplier,
  getConsumptionReport,
  listMaterials,
  listMovements,
  listPurchases,
  listSuppliers,
  registerMovement,
} from '../services/inventoryService.js';

export default function InventoryPage() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState('');
  const [materialForm, setMaterialForm] = useState({ name: '', unit: 'un', minQty: 0, currentQty: 0 });
  const [movementForm, setMovementForm] = useState({ materialId: '', type: 'entrada', qty: 0, date: '', reason: '' });
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '' });
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', date: '', total: 0 });
  const [reportFilter, setReportFilter] = useState({ startDate: '', endDate: '' });

  const refresh = () => {
    setMaterials(listMaterials());
    setSuppliers(listSuppliers());
    setMovements(listMovements());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleMaterial = (event) => {
    event.preventDefault();
    setError('');
    try {
      createMaterial(user, materialForm);
      setMaterialForm({ name: '', unit: 'un', minQty: 0, currentQty: 0 });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMovement = (event) => {
    event.preventDefault();
    setError('');
    try {
      registerMovement(user, movementForm);
      setMovementForm({ materialId: '', type: 'entrada', qty: 0, date: '', reason: '' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSupplier = (event) => {
    event.preventDefault();
    setError('');
    try {
      createSupplier(user, supplierForm);
      setSupplierForm({ name: '', contact: '' });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePurchase = (event) => {
    event.preventDefault();
    setError('');
    try {
      createPurchase(user, purchaseForm);
      setPurchaseForm({ supplierId: '', date: '', total: 0 });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const consumption = getConsumptionReport(reportFilter);
  const purchases = listPurchases();

  return (
    <div className="stack">
      <Section title="Materiais e alertas">
        <form className="form-grid" onSubmit={handleMaterial}>
          <Field label="Nome">
            <input value={materialForm.name} onChange={(event) => setMaterialForm({ ...materialForm, name: event.target.value })} />
          </Field>
          <Field label="Unidade">
            <input value={materialForm.unit} onChange={(event) => setMaterialForm({ ...materialForm, unit: event.target.value })} />
          </Field>
          <Field label="Mínimo">
            <input type="number" value={materialForm.minQty} onChange={(event) => setMaterialForm({ ...materialForm, minQty: event.target.value })} />
          </Field>
          <Field label="Estoque atual">
            <input
              type="number"
              value={materialForm.currentQty}
              onChange={(event) => setMaterialForm({ ...materialForm, currentQty: event.target.value })}
            />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Salvar material
          </button>
        </form>
        <div className="card">
          <h3>Estoque</h3>
          <ul className="list">
            {materials.map((item) => (
              <li key={item.id}>
                {item.name} · {item.currentQty} {item.unit} {item.currentQty <= item.minQty ? '⚠️' : ''}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Movimentação">
        <form className="form-grid" onSubmit={handleMovement}>
          <Field label="Material">
            <select value={movementForm.materialId} onChange={(event) => setMovementForm({ ...movementForm, materialId: event.target.value })}>
              <option value="">Selecione</option>
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select value={movementForm.type} onChange={(event) => setMovementForm({ ...movementForm, type: event.target.value })}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </Field>
          <Field label="Quantidade">
            <input type="number" value={movementForm.qty} onChange={(event) => setMovementForm({ ...movementForm, qty: event.target.value })} />
          </Field>
          <Field label="Data">
            <input type="date" value={movementForm.date} onChange={(event) => setMovementForm({ ...movementForm, date: event.target.value })} />
          </Field>
          <Field label="Motivo">
            <input value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Registrar
          </button>
        </form>
        <div className="card">
          <h3>Últimas movimentações</h3>
          <ul className="list">
            {movements.slice(-5).map((item) => (
              <li key={item.id}>
                {item.date} · {item.type} · {item.qty}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Fornecedores e compras">
        <form className="form-grid" onSubmit={handleSupplier}>
          <Field label="Fornecedor">
            <input value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} />
          </Field>
          <Field label="Contato">
            <input value={supplierForm.contact} onChange={(event) => setSupplierForm({ ...supplierForm, contact: event.target.value })} />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="button primary" type="submit">
            Salvar fornecedor
          </button>
        </form>

        <form className="form-grid" onSubmit={handlePurchase}>
          <Field label="Fornecedor">
            <select value={purchaseForm.supplierId} onChange={(event) => setPurchaseForm({ ...purchaseForm, supplierId: event.target.value })}>
              <option value="">Selecione</option>
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={purchaseForm.date} onChange={(event) => setPurchaseForm({ ...purchaseForm, date: event.target.value })} />
          </Field>
          <Field label="Total">
            <input type="number" value={purchaseForm.total} onChange={(event) => setPurchaseForm({ ...purchaseForm, total: event.target.value })} />
          </Field>
          <button className="button primary" type="submit">
            Registrar compra
          </button>
        </form>
        <div className="card">
          <h3>Compras</h3>
          <ul className="list">
            {purchases.slice(-5).map((item) => (
              <li key={item.id}>
                {item.date} · {item.total}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Relatório de consumo">
        <div className="form-grid">
          <Field label="Início">
            <input
              type="date"
              value={reportFilter.startDate}
              onChange={(event) => setReportFilter({ ...reportFilter, startDate: event.target.value })}
            />
          </Field>
          <Field label="Fim">
            <input
              type="date"
              value={reportFilter.endDate}
              onChange={(event) => setReportFilter({ ...reportFilter, endDate: event.target.value })}
            />
          </Field>
        </div>
        <div className="card">
          <ul className="list">
            {consumption.length === 0 ? (
              <li className="muted">Sem consumo no período.</li>
            ) : (
              consumption.map((item) => (
                <li key={item.id}>
                  {item.date} · {item.materialId} · {item.qty}
                </li>
              ))
            )}
          </ul>
        </div>
      </Section>
    </div>
  );
}
