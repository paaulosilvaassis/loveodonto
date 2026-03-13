import { loadDb, withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, normalizeText } from './helpers.js';
import { logAction } from './logService.js';

const normalizeDocument = (doc) => (doc || '').replace(/[^\d]/g, '');

export const listSuppliers = () => {
  const db = loadDb();
  return Array.isArray(db.suppliers) ? db.suppliers : [];
};

export const createSupplier = (user, payload) => {
  requirePermission(user, 'finance:write');

  const person_type = payload.person_type || 'PJ';
  const legal_name = normalizeText(payload.legal_name);
  const trade_name = normalizeText(payload.trade_name);
  const document = normalizeText(payload.document);
  const state_registration = normalizeText(payload.state_registration);
  const category = normalizeText(payload.category);
  const status = payload.status || 'ativo';

  const contact_name = normalizeText(payload.contact_name);
  const phone = normalizeText(payload.phone);
  const whatsapp = normalizeText(payload.whatsapp);
  const email = normalizeText(payload.email);
  const website = normalizeText(payload.website);

  const zip_code = normalizeText(payload.zip_code);
  const street = normalizeText(payload.street);
  const number = normalizeText(payload.number);
  const complement = normalizeText(payload.complement);
  const district = normalizeText(payload.district);
  const city = normalizeText(payload.city);
  const state = normalizeText(payload.state);

  const preferred_payment_method = normalizeText(payload.preferred_payment_method);
  const pix_key = normalizeText(payload.pix_key);
  const bank = normalizeText(payload.bank);
  const agency = normalizeText(payload.agency);
  const account = normalizeText(payload.account);
  const account_type = normalizeText(payload.account_type);
  const account_holder = normalizeText(payload.account_holder);
  const average_payment_term_days = Number(payload.average_payment_term_days || 0);

  const notes = normalizeText(payload.notes);

  // Validações obrigatórias
  if (!trade_name && !legal_name) {
    throw new Error('Informe pelo menos Nome fantasia ou Razão social.');
  }
  if (!category) {
    throw new Error('Categoria é obrigatória.');
  }
  if (!phone) {
    throw new Error('Telefone principal é obrigatório.');
  }
  if (!status) {
    throw new Error('Status é obrigatório.');
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf53c2'},body:JSON.stringify({sessionId:'bf53c2',location:'suppliersService.js:createSupplier',message:'createSupplier called',data:{hasTrade:!!trade_name,hasLegal:!!legal_name,category,phone,status,document},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const normalizedDoc = normalizeDocument(document);
  if (normalizedDoc) {
    const existing = listSuppliers().find(
      (s) => normalizeDocument(s.document) === normalizedDoc
    );
    if (existing) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf53c2'},body:JSON.stringify({sessionId:'bf53c2',location:'suppliersService.js:createSupplier',message:'duplicate document detected',data:{document,existingId:existing.id},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      throw new Error('Já existe fornecedor cadastrado com este CPF/CNPJ.');
    }
  }

  const now = new Date().toISOString();
  const id = createId('sup');

  const supplier = {
    id,
    person_type,
    legal_name,
    trade_name,
    document,
    state_registration,
    category,
    status,
    contact_name,
    phone,
    whatsapp,
    email,
    website,
    zip_code,
    street,
    number,
    complement,
    district,
    city,
    state,
    preferred_payment_method,
    pix_key,
    bank,
    agency,
    account,
    account_type,
    account_holder,
    average_payment_term_days,
    notes,
    created_at: now,
    updated_at: now,
    // Campos de compatibilidade com módulos existentes (estoque, etc.)
    name: trade_name || legal_name,
    contact: contact_name,
  };

  withDb((db) => {
    if (!Array.isArray(db.suppliers)) db.suppliers = [];
    db.suppliers.push(supplier);
    return db;
  });

  logAction('suppliers:create', { supplierId: id, userId: user?.id || null });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf53c2'},body:JSON.stringify({sessionId:'bf53c2',location:'suppliersService.js:createSupplier',message:'supplier created',data:{id,category,status},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  return supplier;
};

