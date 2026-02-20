import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

/**
 * Enums e constantes
 */
export const PROCEDURE_STATUS = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
};

export const PROCEDURE_SEGMENT = {
  ODONTOLOGIA: 'ODONTOLOGIA',
  OROFACIAL: 'OROFACIAL',
  DIAGNOSTICO_IMAGEM: 'DIAGNOSTICO_IMAGEM',
};

export const PRICE_RESTRICTION = {
  LIVRE: 'LIVRE',
  AVISAR: 'AVISAR',
  BLOQUEAR: 'BLOQUEAR',
  FIXO: 'FIXO',
};

export const COMMISSION_TYPE = {
  NENHUMA: 'NENHUMA',
  PERCENTUAL: 'PERCENTUAL',
  VALOR: 'VALOR',
};

/**
 * Lista de especialidades (pode ser expandida depois)
 */
export const SPECIALTIES = [
  'Clínica Geral',
  'Ortodontia',
  'Implantodontia',
  'Periodontia',
  'Endodontia',
  'Prótese',
  'Cirurgia',
  'Estética',
  'Harmonização Facial',
  'Radiologia',
  'Análise Clínica',
  'Outros',
];

/**
 * Valida código TUSS (8 dígitos ou formato 0.00.00.000)
 */
export const validateTussCode = (code) => {
  if (!code) return { valid: true };
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length === 8) return { valid: true };
  if (/^0\.00\.00\.000$/.test(code)) return { valid: true };
  return { valid: false, error: 'Código TUSS deve ter 8 dígitos ou formato 0.00.00.000' };
};

/**
 * Formata código TUSS para exibição
 */
export const formatTussCode = (code) => {
  if (!code) return '';
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 1)}.${cleaned.slice(1, 3)}.${cleaned.slice(3, 5)}.${cleaned.slice(5, 8)}`;
  }
  return code;
};

/**
 * Cria ou atualiza tabela de preço
 */
export const savePriceTable = (user, priceTableData) => {
  return withDb((db) => {
    if (!db.priceTables) {
      db.priceTables = [];
    }

    // Se está marcando como padrão, remover padrão de outras tabelas
    if (priceTableData.isDefault) {
      db.priceTables.forEach((table) => {
        if (table.id !== priceTableData.id) {
          table.isDefault = false;
        }
      });
    }

    const index = db.priceTables.findIndex((pt) => pt.id === priceTableData.id);

    const tableData = {
      ...priceTableData,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id || null,
    };

    if (index >= 0) {
      db.priceTables[index] = {
        ...db.priceTables[index],
        ...tableData,
      };
    } else {
      db.priceTables.push({
        id: createId('pricetable'),
        ...tableData,
        createdAt: new Date().toISOString(),
        createdByUserId: user?.id || null,
      });
    }

    return db;
  });
};

/**
 * Lista todas as tabelas de preço
 */
export const listPriceTables = () => {
  const db = loadDb();
  return (db.priceTables || []).sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
  });
};

/**
 * Obtém tabela de preço padrão
 */
export const getDefaultPriceTable = () => {
  const tables = listPriceTables();
  return tables.find((t) => t.isDefault) || tables[0] || null;
};

/**
 * Obtém tabela de preço por ID
 */
export const getPriceTable = (id) => {
  const db = loadDb();
  return (db.priceTables || []).find((pt) => pt.id === id) || null;
};

/**
 * Remove tabela de preço
 */
export const deletePriceTable = (id) => {
  return withDb((db) => {
    if (!db.priceTables) {
      db.priceTables = [];
    }
    db.priceTables = db.priceTables.filter((pt) => pt.id !== id);
    // Remover overrides relacionados
    if (db.procedurePriceOverrides) {
      db.procedurePriceOverrides = db.procedurePriceOverrides.filter(
        (override) => override.priceTableId !== id
      );
    }
    return db;
  });
};

/**
 * Duplica tabela de preço
 */
export const duplicatePriceTable = (user, sourceTableId, newName) => {
  return withDb((db) => {
    const sourceTable = getPriceTable(sourceTableId);
    if (!sourceTable) {
      throw new Error('Tabela de preço não encontrada');
    }

    const newTableId = createId('pricetable');
    const newTable = {
      ...sourceTable,
      id: newTableId,
      name: newName || `${sourceTable.name} (Cópia)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      createdByUserId: user?.id || null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id || null,
    };

    db.priceTables.push(newTable);

    // Duplicar overrides
    if (db.procedurePriceOverrides) {
      const sourceOverrides = db.procedurePriceOverrides.filter(
        (override) => override.priceTableId === sourceTableId
      );
      sourceOverrides.forEach((override) => {
        db.procedurePriceOverrides.push({
          ...override,
          id: createId('override'),
          priceTableId: newTableId,
        });
      });
    }

    return db;
  });
};

/**
 * Cria ou atualiza procedimento no catálogo
 */
export const saveProcedure = (user, procedureData) => {
  // Validações
  if (!procedureData.title || procedureData.title.trim() === '') {
    throw new Error('Título do procedimento é obrigatório');
  }
  if (!procedureData.specialty) {
    throw new Error('Especialidade é obrigatória');
  }
  if (!procedureData.defaultPrice || procedureData.defaultPrice <= 0) {
    throw new Error('Preço padrão deve ser maior que zero');
  }
  if (procedureData.minPrice && procedureData.maxPrice) {
    if (procedureData.minPrice > procedureData.maxPrice) {
      throw new Error('Preço mínimo não pode ser maior que preço máximo');
    }
    if (procedureData.defaultPrice < procedureData.minPrice || procedureData.defaultPrice > procedureData.maxPrice) {
      throw new Error('Preço padrão deve estar entre mínimo e máximo');
    }
  }
  if (procedureData.tussCode) {
    const tussValidation = validateTussCode(procedureData.tussCode);
    if (!tussValidation.valid) {
      throw new Error(tussValidation.error);
    }
  }

  return withDb((db) => {
    if (!db.procedureCatalog) {
      db.procedureCatalog = [];
    }

    const index = db.procedureCatalog.findIndex((proc) => proc.id === procedureData.id);

    const procData = {
      ...procedureData,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id || null,
    };

    if (index >= 0) {
      db.procedureCatalog[index] = {
        ...db.procedureCatalog[index],
        ...procData,
      };
    } else {
      db.procedureCatalog.push({
        id: createId('procedure'),
        ...procData,
        createdAt: new Date().toISOString(),
        createdByUserId: user?.id || null,
      });
    }

    return db;
  });
};

/**
 * Lista procedimentos do catálogo
 */
export const listProcedures = (filters = {}) => {
  const db = loadDb();
  let procedures = db.procedureCatalog || [];

  // Filtrar por segmento
  if (filters.segment) {
    procedures = procedures.filter((p) => p.segment === filters.segment);
  }

  // Filtrar por especialidade
  if (filters.specialty) {
    procedures = procedures.filter((p) => p.specialty === filters.specialty);
  }

  // Filtrar por status
  if (filters.status) {
    procedures = procedures.filter((p) => p.status === filters.status);
  }

  // Filtrar por busca (título, código interno, TUSS)
  if (filters.search) {
    const query = filters.search.toLowerCase();
    procedures = procedures.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(query)) ||
        (p.tussCode && p.tussCode.toLowerCase().includes(query))
    );
  }

  // Filtrar por restrição
  if (filters.hasRestriction) {
    procedures = procedures.filter(
      (p) => p.priceRestriction && p.priceRestriction !== PRICE_RESTRICTION.LIVRE
    );
  }

  // Ordenar
  if (filters.sortBy === 'price_desc') {
    procedures.sort((a, b) => (b.defaultPrice || 0) - (a.defaultPrice || 0));
  } else if (filters.sortBy === 'price_asc') {
    procedures.sort((a, b) => (a.defaultPrice || 0) - (b.defaultPrice || 0));
  } else if (filters.sortBy === 'updated') {
    procedures.sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
  } else {
    // A-Z por padrão
    procedures.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  return procedures;
};

/**
 * Obtém procedimento por ID
 */
export const getProcedure = (id) => {
  const db = loadDb();
  return (db.procedureCatalog || []).find((p) => p.id === id) || null;
};

/**
 * Remove procedimento do catálogo
 */
export const deleteProcedure = (id) => {
  return withDb((db) => {
    if (!db.procedureCatalog) {
      db.procedureCatalog = [];
    }
    db.procedureCatalog = db.procedureCatalog.filter((p) => p.id !== id);
    // Remover overrides relacionados
    if (db.procedurePriceOverrides) {
      db.procedurePriceOverrides = db.procedurePriceOverrides.filter(
        (override) => override.procedureId !== id
      );
    }
    return db;
  });
};

/**
 * Desativa procedimento (marca como INATIVO)
 */
export const deactivateProcedure = (id) => {
  return withDb((db) => {
    const index = (db.procedureCatalog || []).findIndex((p) => p.id === id);
    if (index >= 0) {
      db.procedureCatalog[index].status = PROCEDURE_STATUS.INATIVO;
      db.procedureCatalog[index].updatedAt = new Date().toISOString();
    }
    return db;
  });
};

/**
 * Obtém preço efetivo de um procedimento para uma tabela
 */
export const getEffectivePrice = (procedureId, priceTableId = null) => {
  const procedure = getProcedure(procedureId);
  if (!procedure) return null;

  // Se não há tabela especificada, usar padrão
  if (!priceTableId) {
    const defaultTable = getDefaultPriceTable();
    priceTableId = defaultTable?.id || null;
  }

  // Buscar override
  if (priceTableId) {
    const db = loadDb();
    const override = (db.procedurePriceOverrides || []).find(
      (o) => o.procedureId === procedureId && o.priceTableId === priceTableId
    );
    if (override) {
      return {
        price: override.overridePrice,
        minPrice: override.overrideMinPrice ?? procedure.minPrice,
        maxPrice: override.overrideMaxPrice ?? procedure.maxPrice,
        restriction: override.overrideRestriction ?? procedure.priceRestriction,
        procedure,
      };
    }
  }

  return {
    price: procedure.defaultPrice,
    minPrice: procedure.minPrice,
    maxPrice: procedure.maxPrice,
    restriction: procedure.priceRestriction,
    procedure,
  };
};

/**
 * Salva ou atualiza override de preço
 */
export const savePriceOverride = (user, priceTableId, procedureId, overrideData) => {
  return withDb((db) => {
    if (!db.procedurePriceOverrides) {
      db.procedurePriceOverrides = [];
    }

    const index = db.procedurePriceOverrides.findIndex(
      (o) => o.priceTableId === priceTableId && o.procedureId === procedureId
    );

    const override = {
      ...overrideData,
      priceTableId,
      procedureId,
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      db.procedurePriceOverrides[index] = {
        ...db.procedurePriceOverrides[index],
        ...override,
      };
    } else {
      db.procedurePriceOverrides.push({
        id: createId('override'),
        ...override,
      });
    }

    return db;
  });
};

/**
 * Remove override de preço
 */
export const deletePriceOverride = (priceTableId, procedureId) => {
  return withDb((db) => {
    if (!db.procedurePriceOverrides) {
      db.procedurePriceOverrides = [];
    }
    db.procedurePriceOverrides = db.procedurePriceOverrides.filter(
      (o) => !(o.priceTableId === priceTableId && o.procedureId === procedureId)
    );
    return db;
  });
};

/**
 * Obtém tabela de preço para um paciente (por convênio ou padrão)
 */
export const getPriceTableForPatient = (patient) => {
  if (!patient) {
    return getDefaultPriceTable();
  }

  // Se paciente tem convênio, buscar tabela com nome do convênio
  if (patient.insurance_provider) {
    const db = loadDb();
    const insuranceTable = (db.priceTables || []).find(
      (t) => t.name.toLowerCase().includes(patient.insurance_provider.toLowerCase())
    );
    if (insuranceTable) {
      return insuranceTable;
    }
  }

  return getDefaultPriceTable();
};
