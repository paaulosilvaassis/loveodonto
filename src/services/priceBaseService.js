import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { logAction } from './logService.js';

/**
 * Enums e constantes
 */
export const PROCEDURE_SEGMENT = {
  ODONTOLOGIA: 'ODONTOLOGIA',
  OROFACIAL: 'OROFACIAL',
  DIAGNOSTICO_IMAGEM: 'DIAGNOSTICO_IMAGEM',
};

export const PRICE_TABLE_TYPE = {
  PARTICULAR: 'PARTICULAR',
  CONVENIO: 'CONVENIO',
  PROMOCIONAL: 'PROMOCIONAL',
  PARCERIA: 'PARCERIA',
  INTERNA: 'INTERNA',
};

export const PROCEDURE_STATUS = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
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
 * Especialidades odontológicas (lista inicial)
 */
export const SPECIALTIES = [
  'Clínica Geral',
  'Endodontia',
  'Periodontia',
  'Ortodontia',
  'Implantodontia',
  'Prótese',
  'Cirurgia',
  'Estética',
  'Harmonização Orofacial',
  'Radiologia',
  'Anatomia Patológica',
  'Outras',
];

/**
 * Validação de código TUSS
 */
export const validateTussCode = (code) => {
  if (!code) return { valid: true };
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length === 8) return { valid: true };
  if (code.match(/^0\.00\.00\.000$/)) return { valid: true };
  return { valid: false, error: 'Código TUSS deve ter 8 dígitos ou formato 0.00.00.000' };
};

/**
 * CRUD: PriceTable (Tabela de Preço)
 */
export const createPriceTable = (user, data) => {
  return withDb((db) => {
    if (!db.priceTables) {
      db.priceTables = [];
    }

    // Se isDefault = true, remover default de outras tabelas
    if (data.isDefault) {
      db.priceTables.forEach((table) => {
        table.isDefault = false;
      });
    }

    const newTable = {
      id: createId('pricetable'),
      name: data.name,
      type: data.type || PRICE_TABLE_TYPE.PARTICULAR,
      isDefault: data.isDefault || false,
      active: data.active !== undefined ? data.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: user?.id || null,
      updatedByUserId: user?.id || null,
    };

    db.priceTables.push(newTable);
    return db;
  });
};

export const updatePriceTable = (user, tableId, data) => {
  return withDb((db) => {
    const index = db.priceTables.findIndex((t) => t.id === tableId);
    if (index < 0) {
      throw new Error('Tabela de preço não encontrada');
    }

    // Se isDefault = true, remover default de outras tabelas
    if (data.isDefault) {
      db.priceTables.forEach((table) => {
        if (table.id !== tableId) {
          table.isDefault = false;
        }
      });
    }

    db.priceTables[index] = {
      ...db.priceTables[index],
      ...data,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id || null,
    };

    return db;
  });
};

export const deletePriceTable = (user, tableId) => {
  return withDb((db) => {
    const table = db.priceTables.find((t) => t.id === tableId);
    if (table?.isDefault) {
      throw new Error('Não é possível excluir a tabela padrão');
    }

    db.priceTables = db.priceTables.filter((t) => t.id !== tableId);
    // Remover procedimentos relacionados
    db.priceTableProcedures = (db.priceTableProcedures || []).filter(
      (p) => p.priceTableId !== tableId
    );

    return db;
  });
};

export const listPriceTables = () => {
  const db = loadDb();
  return db.priceTables || [];
};

export const getDefaultPriceTable = () => {
  const db = loadDb();
  return db.priceTables?.find((t) => t.isDefault) || db.priceTables?.[0] || null;
};

export const duplicatePriceTable = (user, tableId, newName) => {
  let newTableId = null;
  withDb((db) => {
    const sourceTable = db.priceTables.find((t) => t.id === tableId);
    if (!sourceTable) {
      throw new Error('Tabela não encontrada');
    }

    const newTable = {
      ...sourceTable,
      id: createId('pricetable'),
      name: newName,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: user?.id || null,
      updatedByUserId: user?.id || null,
    };

    newTableId = newTable.id;
    db.priceTables.push(newTable);

    // Copiar procedimentos
    const sourceProcedures = (db.priceTableProcedures || []).filter(
      (p) => p.priceTableId === tableId
    );
    sourceProcedures.forEach((proc) => {
      db.priceTableProcedures.push({
        ...proc,
        id: createId('procedure'),
        priceTableId: newTable.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: user?.id || null,
        updatedByUserId: user?.id || null,
      });
    });

    return db;
  });
  return { id: newTableId };
};

/**
 * CRUD: PriceTableProcedure (Procedimento dentro de uma tabela)
 */
export const createProcedure = (user, priceTableId, data) => {
  // Validações
  if (!priceTableId) {
    throw new Error('ID da tabela de preço é obrigatório');
  }
  if (!data.title || !data.title.trim()) {
    throw new Error('Título do procedimento é obrigatório');
  }
  if (!data.specialty) {
    throw new Error('Especialidade é obrigatória');
  }
  if (!data.price || data.price <= 0) {
    throw new Error('Preço deve ser maior que zero');
  }
  if (data.minPrice && data.maxPrice && data.minPrice > data.maxPrice) {
    throw new Error('Preço mínimo não pode ser maior que o máximo');
  }
  if (data.minPrice && data.price < data.minPrice) {
    throw new Error('Preço não pode ser menor que o mínimo');
  }
  if (data.maxPrice && data.price > data.maxPrice) {
    throw new Error('Preço não pode ser maior que o máximo');
  }

  const tussValidation = validateTussCode(data.tussCode);
  if (!tussValidation.valid) {
    throw new Error(tussValidation.error);
  }

  return withDb((db) => {
    // Verificar se a tabela existe
    const table = db.priceTables?.find((t) => t.id === priceTableId);
    if (!table) {
      throw new Error('Tabela de preço não encontrada');
    }

    if (!db.priceTableProcedures) {
      db.priceTableProcedures = [];
    }

    const newProcedure = {
      id: createId('procedure'),
      priceTableId,
      title: data.title.trim(),
      status: data.status || PROCEDURE_STATUS.ATIVO,
      segment: data.segment || PROCEDURE_SEGMENT.ODONTOLOGIA,
      specialty: data.specialty,
      tussCode: data.tussCode || null,
      internalCode: data.internalCode || null,
      shortcut: data.shortcut || null,
      costPrice: data.costPrice ?? null,
      price: data.price,
      minPrice: data.minPrice ?? null,
      maxPrice: data.maxPrice ?? null,
      priceRestriction: data.priceRestriction || PRICE_RESTRICTION.LIVRE,
      commissionType: data.commissionType || COMMISSION_TYPE.NENHUMA,
      commissionValue: data.commissionValue ?? null,
      notes: data.notes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: user?.id || null,
      updatedByUserId: user?.id || null,
    };

    db.priceTableProcedures.push(newProcedure);
    return db;
  });
};

export const updateProcedure = (user, procedureId, data) => {
  const payload = { ...data };
  if (payload.defaultPrice !== undefined && payload.price === undefined) {
    payload.price = payload.defaultPrice;
    delete payload.defaultPrice;
  }
  // Validações (mesmas do create)
  if (payload.title !== undefined && !payload.title.trim()) {
    throw new Error('Título do procedimento é obrigatório');
  }
  if (payload.price !== undefined && payload.price <= 0) {
    throw new Error('Preço deve ser maior que zero');
  }
  if (payload.minPrice && payload.maxPrice && payload.minPrice > payload.maxPrice) {
    throw new Error('Preço mínimo não pode ser maior que o máximo');
  }
  if (payload.minPrice && payload.price < payload.minPrice) {
    throw new Error('Preço não pode ser menor que o mínimo');
  }
  if (payload.maxPrice && payload.price > payload.maxPrice) {
    throw new Error('Preço não pode ser maior que o máximo');
  }

  if (payload.tussCode !== undefined) {
    const tussValidation = validateTussCode(payload.tussCode);
    if (!tussValidation.valid) {
      throw new Error(tussValidation.error);
    }
  }

  return withDb((db) => {
    if (!db.priceTableProcedures) {
      db.priceTableProcedures = [];
    }
    const index = db.priceTableProcedures.findIndex((p) => p.id === procedureId);
    if (index < 0) {
      throw new Error('Procedimento não encontrado');
    }

    db.priceTableProcedures[index] = {
      ...db.priceTableProcedures[index],
      ...payload,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user?.id || null,
    };

    return db;
  });
};

export const deleteProcedure = (user, procedureId) => {
  return withDb((db) => {
    db.priceTableProcedures = (db.priceTableProcedures || []).filter((p) => p.id !== procedureId);
    return db;
  });
};

export const listProcedures = (filters = {}) => {
  const db = loadDb();
  
  // OBRIGATÓRIO: priceTableId é necessário para listar procedimentos
  if (!filters.priceTableId) {
    return [];
  }

  let procedures = (db.priceTableProcedures || []).filter(
    (p) => p.priceTableId === filters.priceTableId
  );

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

  // Filtrar por restrição
  if (filters.hasRestriction) {
    procedures = procedures.filter(
      (p) => p.priceRestriction !== PRICE_RESTRICTION.LIVRE
    );
  }

  // Busca por texto
  if (filters.search) {
    const query = filters.search.toLowerCase();
    procedures = procedures.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        (p.internalCode && p.internalCode.toLowerCase().includes(query)) ||
        (p.tussCode && p.tussCode.includes(query))
    );
  }

  // Ordenação
  if (filters.sortBy === 'name') {
    procedures.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filters.sortBy === 'price_desc') {
    procedures.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (filters.sortBy === 'price_asc') {
    procedures.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (filters.sortBy === 'updated') {
    procedures.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  return procedures;
};

export const getProcedure = (procedureId) => {
  const db = loadDb();
  return db.priceTableProcedures?.find((p) => p.id === procedureId) || null;
};

/**
 * CRUD: ProcedurePriceOverride (Preço por tabela)
 */
export const setPriceOverride = (user, priceTableId, procedureId, overrideData) => {
  return withDb((db) => {
    if (!db.procedurePriceOverrides) {
      db.procedurePriceOverrides = [];
    }

    const index = db.procedurePriceOverrides.findIndex(
      (o) => o.priceTableId === priceTableId && o.procedureId === procedureId
    );

    const override = {
      id: index >= 0 ? db.procedurePriceOverrides[index].id : createId('override'),
      priceTableId,
      procedureId,
      overridePrice: overrideData.overridePrice,
      overrideMinPrice: overrideData.overrideMinPrice || null,
      overrideMaxPrice: overrideData.overrideMaxPrice || null,
      overrideRestriction: overrideData.overrideRestriction || null,
      updatedAt: new Date().toISOString(),
    };

    if (index >= 0) {
      db.procedurePriceOverrides[index] = override;
    } else {
      db.procedurePriceOverrides.push(override);
    }

    return db;
  });
};

export const removePriceOverride = (user, priceTableId, procedureId) => {
  return withDb((db) => {
    db.procedurePriceOverrides = (db.procedurePriceOverrides || []).filter(
      (o) => !(o.priceTableId === priceTableId && o.procedureId === procedureId)
    );
    return db;
  });
};

export const getPriceOverride = (priceTableId, procedureId) => {
  const db = loadDb();
  return (
    db.procedurePriceOverrides?.find(
      (o) => o.priceTableId === priceTableId && o.procedureId === procedureId
    ) || null
  );
};

/**
 * Função auxiliar: obter preço efetivo de um procedimento
 * Agora simplesmente retorna os dados do procedimento (já pertence a uma tabela)
 */
export const getEffectivePrice = (procedureId, priceTableId = null) => {
  const db = loadDb();
  const procedure = db.priceTableProcedures?.find((p) => p.id === procedureId);
  if (!procedure) return null;

  // Se especificou tabela, verificar se o procedimento pertence a ela
  if (priceTableId && procedure.priceTableId !== priceTableId) {
    return null; // Procedimento não pertence à tabela especificada
  }

  return {
    price: procedure.price,
    minPrice: procedure.minPrice,
    maxPrice: procedure.maxPrice,
    restriction: procedure.priceRestriction,
  };
};

/**
 * Função auxiliar: obter tabela de preço para um paciente (por convênio)
 */
export const getPriceTableForPatient = (patient) => {
  const db = loadDb();
  if (!patient?.insurance_provider) {
    return getDefaultPriceTable();
  }

  // Buscar tabela com nome do convênio
  const table = db.priceTables?.find(
    (t) => t.name.toLowerCase() === patient.insurance_provider.toLowerCase()
  );
  return table || getDefaultPriceTable();
};

/**
 * Importação em lote de procedimentos (criar/atualizar) para uma tabela específica
 */
export const importProceduresBatch = ({
  user,
  priceTableId,
  createItems = [],
  updateItems = [],
  overrideItems = [],
  audit = {},
}) => {
  if (!priceTableId) {
    throw new Error('ID da tabela de preço é obrigatório para importação');
  }

  let createdCount = 0;
  let updatedCount = 0;
  let overrideCount = 0;

  withDb((db) => {
    // Verificar se a tabela existe
    const table = db.priceTables?.find((t) => t.id === priceTableId);
    if (!table) {
      throw new Error('Tabela de preço não encontrada');
    }

    db.priceTableProcedures = db.priceTableProcedures || [];
    db.procedurePriceOverrides = db.procedurePriceOverrides || [];

    createItems.forEach((item, index) => {
      const newProcedure = {
        id: createId('procedure'),
        priceTableId, // OBRIGATÓRIO: sempre vinculado à tabela
        title: item.title.trim(),
        status: item.status || PROCEDURE_STATUS.ATIVO,
        segment: item.segment || PROCEDURE_SEGMENT.ODONTOLOGIA,
        specialty: item.specialty,
        tussCode: item.tussCode || null,
        internalCode: item.internalCode || null,
        shortcut: item.shortcut || null,
        costPrice: item.costPrice ?? null,
        price: item.price || item.defaultPrice || 0, // Corrigido: usar price primeiro, depois defaultPrice como fallback
        minPrice: item.minPrice ?? null,
        maxPrice: item.maxPrice ?? null,
        priceRestriction: item.priceRestriction || PRICE_RESTRICTION.LIVRE,
        commissionType: item.commissionType || COMMISSION_TYPE.NENHUMA,
        commissionValue: item.commissionValue ?? null,
        notes: item.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUserId: user?.id || null,
        updatedByUserId: user?.id || null,
      };
      db.priceTableProcedures.push(newProcedure);
      createdCount += 1;

      // Overrides da tabela, se houver
      const override = overrideItems.find((o) => o.procedureId === item.__tempId);
      if (override) {
        db.procedurePriceOverrides.push({
          id: createId('override'),
          priceTableId: override.priceTableId,
          procedureId: newProcedure.id,
          overridePrice: override.overridePrice,
          overrideMinPrice: override.overrideMinPrice || null,
          overrideMaxPrice: override.overrideMaxPrice || null,
          overrideRestriction: override.overrideRestriction || null,
          updatedAt: new Date().toISOString(),
        });
        overrideCount += 1;
      }
    });

    updateItems.forEach((item) => {
      // Atualizar apenas procedimentos da tabela especificada
      const index = db.priceTableProcedures.findIndex(
        (p) => p.id === item.id && p.priceTableId === priceTableId
      );
      if (index < 0) return;
      
      const updateData = { ...item.data };
      // Garantir que price seja usado (compatibilidade com defaultPrice)
      if (updateData.defaultPrice !== undefined && !updateData.price) {
        updateData.price = updateData.defaultPrice;
        delete updateData.defaultPrice;
      }
      
      db.priceTableProcedures[index] = {
        ...db.priceTableProcedures[index],
        ...updateData,
        updatedAt: new Date().toISOString(),
        updatedByUserId: user?.id || null,
      };
      updatedCount += 1;

      if (item.override) {
        const overrideIndex = db.procedurePriceOverrides.findIndex(
          (o) => o.priceTableId === item.override.priceTableId && o.procedureId === item.id
        );
        const payload = {
          id: overrideIndex >= 0 ? db.procedurePriceOverrides[overrideIndex].id : createId('override'),
          priceTableId: item.override.priceTableId,
          procedureId: item.id,
          overridePrice: item.override.overridePrice,
          overrideMinPrice: item.override.overrideMinPrice || null,
          overrideMaxPrice: item.override.overrideMaxPrice || null,
          overrideRestriction: item.override.overrideRestriction || null,
          updatedAt: new Date().toISOString(),
        };
        if (overrideIndex >= 0) {
          db.procedurePriceOverrides[overrideIndex] = payload;
        } else {
          db.procedurePriceOverrides.push(payload);
        }
        overrideCount += 1;
      }
    });

    return db;
  });

  logAction('price_base:import', {
    ...audit,
    priceTableId,
    createdCount,
    updatedCount,
    overrideCount,
    userId: user?.id || null,
  });

  return { createdCount, updatedCount, overrideCount };
};
