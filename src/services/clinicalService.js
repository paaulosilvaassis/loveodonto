import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';

/**
 * Salva observação do orçamento (evolução clínica vinculada ao atendimento e, se existir, ao orçamento).
 * Cria novo registro; não sobrescreve. Permite salvar sem orçamento (rascunho); vincula ao budgetId quando existir.
 */
export const saveClinicalEvolution = (user, appointmentId, evolution, patientId = null, budgetId = null) => {
  return withDb((db) => {
    // Obter patientId do appointment se não fornecido
    let finalPatientId = patientId;
    if (!finalPatientId) {
      const appointment = db.appointments?.find((a) => a.id === appointmentId);
      if (appointment) {
        finalPatientId = appointment.patientId;
      }
    }

    // Vincular ao orçamento ativo do atendimento se não informado
    let finalBudgetId = budgetId;
    if (finalBudgetId == null) {
      const clinicalData = db.clinicalAppointments?.find((ca) => ca.appointmentId === appointmentId);
      const budget = clinicalData?.budget;
      if (budget?.id) {
        finalBudgetId = budget.id;
      }
    }

    // Criar estrutura de evoluções se não existir
    if (!db.clinicalEvolutions) {
      db.clinicalEvolutions = [];
    }

    // Criar NOVO registro (não atualizar existente)
    const newEvolution = {
      id: createId('evolution'),
      patientId: finalPatientId,
      appointmentId,
      budgetId: finalBudgetId || undefined,
      professionalId: user?.id || null,
      content: evolution || '',
      createdAt: new Date().toISOString(),
    };

    db.clinicalEvolutions.push(newEvolution);

    // Manter compatibilidade: atualizar também o registro antigo (para não quebrar código existente)
    // Mas agora o histórico está em clinicalEvolutions
    if (!db.clinicalAppointments) {
      db.clinicalAppointments = [];
    }

    const index = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );

    const clinicalData = {
      appointmentId,
      evolution: evolution || '',
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    if (index >= 0) {
      db.clinicalAppointments[index] = {
        ...db.clinicalAppointments[index],
        ...clinicalData,
      };
    } else {
      db.clinicalAppointments.push({
        id: createId('clinical'),
        ...clinicalData,
        createdAt: new Date().toISOString(),
      });
    }

    return db;
  });
};

/**
 * Lista evoluções clínicas de um paciente ou atendimento
 */
export const listClinicalEvolutions = (patientId = null, appointmentId = null, limit = null, budgetId = null) => {
  const db = loadDb();
  if (!db.clinicalEvolutions) {
    return [];
  }

  let evolutions = db.clinicalEvolutions;

  if (patientId) {
    evolutions = evolutions.filter((e) => e.patientId === patientId);
  }
  if (appointmentId) {
    evolutions = evolutions.filter((e) => e.appointmentId === appointmentId);
  }
  if (budgetId) {
    evolutions = evolutions.filter((e) => e.budgetId === budgetId);
  }

  evolutions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (limit && limit > 0) {
    evolutions = evolutions.slice(0, limit);
  }

  return evolutions;
};

/**
 * Atualiza uma evolução clínica existente (apenas para administradores)
 */
export const updateClinicalEvolution = (user, evolutionId, newContent) => {
  if (!user || user.role !== 'admin') {
    throw new Error('Apenas administradores podem editar evoluções clínicas');
  }

  return withDb((db) => {
    if (!db.clinicalEvolutions) {
      throw new Error('Evolução não encontrada');
    }

    const index = db.clinicalEvolutions.findIndex((e) => e.id === evolutionId);
    if (index < 0) {
      throw new Error('Evolução não encontrada');
    }

    // Atualizar conteúdo e adicionar informação de edição
    db.clinicalEvolutions[index] = {
      ...db.clinicalEvolutions[index],
      content: newContent || '',
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    return db;
  });
};

/**
 * Adiciona procedimento a um atendimento
 */
export const addProcedure = (user, appointmentId, procedure) => {
  return withDb((db) => {
    if (!db.clinicalAppointments) {
      db.clinicalAppointments = [];
    }

    const index = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );

    const clinicalData = index >= 0 
      ? { ...db.clinicalAppointments[index] }
      : {
          id: createId('clinical'),
          appointmentId,
          procedures: [],
          createdAt: new Date().toISOString(),
        };

    if (!clinicalData.procedures) {
      clinicalData.procedures = [];
    }

    clinicalData.procedures.push({
      id: createId('procedure'),
      ...procedure,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
    });

    clinicalData.updatedAt = new Date().toISOString();
    clinicalData.updatedBy = user.id;

    if (index >= 0) {
      db.clinicalAppointments[index] = clinicalData;
    } else {
      db.clinicalAppointments.push(clinicalData);
    }

    // Registrar evento
    logClinicalEvent(appointmentId, 'procedure_added', {
      procedureName: procedure.name,
      procedureId: clinicalData.procedures[clinicalData.procedures.length - 1].id,
    }, user.id);

    return db;
  });
};

/**
 * Adiciona item ao planejamento (estrutura clínica, sem valor).
 * procedure: { name, tooth?, region?, notes? }
 */
export const addPlannedProcedure = (user, appointmentId, procedure) => {
  return withDb((db) => {
    if (!db.clinicalAppointments) {
      db.clinicalAppointments = [];
    }

    const index = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );

    const clinicalData = index >= 0
      ? { ...db.clinicalAppointments[index] }
      : {
          id: createId('clinical'),
          appointmentId,
          plannedProcedures: [],
          createdAt: new Date().toISOString(),
        };

    if (!clinicalData.plannedProcedures) {
      clinicalData.plannedProcedures = [];
    }

    const item = {
      id: createId('planned'),
      name: procedure.name || '',
      tooth: procedure.tooth || '',
      region: procedure.region || '',
      notes: procedure.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.id,
    };

    clinicalData.plannedProcedures.push(item);
    clinicalData.updatedAt = new Date().toISOString();
    clinicalData.updatedBy = user.id;

    if (index >= 0) {
      db.clinicalAppointments[index] = clinicalData;
    } else {
      db.clinicalAppointments.push(clinicalData);
    }

    logClinicalEvent(appointmentId, 'procedure_planned', {
      procedureName: item.name,
      procedureId: item.id,
    }, user.id);

    return db;
  });
};

/**
 * Atualiza item do planejamento.
 */
export const updatePlannedProcedure = (user, appointmentId, plannedId, data) => {
  return withDb((db) => {
    const idx = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );
    if (idx < 0) throw new Error('Atendimento não encontrado');

    const list = db.clinicalAppointments[idx].plannedProcedures || [];
    const itemIndex = list.findIndex((p) => p.id === plannedId);
    if (itemIndex < 0) throw new Error('Item do planejamento não encontrado');

    const now = new Date().toISOString();
    const prev = list[itemIndex];
    db.clinicalAppointments[idx].plannedProcedures[itemIndex] = {
      ...prev,
      name: data.name !== undefined ? data.name : prev.name,
      tooth: data.tooth !== undefined ? data.tooth : prev.tooth,
      region: data.region !== undefined ? data.region : prev.region,
      notes: data.notes !== undefined ? data.notes : prev.notes,
      updatedAt: now,
    };
    db.clinicalAppointments[idx].updatedAt = now;
    db.clinicalAppointments[idx].updatedBy = user.id;

    return db;
  });
};

/**
 * Remove item do planejamento.
 */
export const removePlannedProcedure = (user, appointmentId, plannedId) => {
  return withDb((db) => {
    const idx = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );
    if (idx < 0) throw new Error('Atendimento não encontrado');

    const list = db.clinicalAppointments[idx].plannedProcedures || [];
    const itemIndex = list.findIndex((p) => p.id === plannedId);
    if (itemIndex < 0) throw new Error('Item do planejamento não encontrado');

    db.clinicalAppointments[idx].plannedProcedures = list.filter(
      (p) => p.id !== plannedId
    );
    db.clinicalAppointments[idx].updatedAt = new Date().toISOString();
    db.clinicalAppointments[idx].updatedBy = user.id;

    return db;
  });
};

/**
 * Obtém dados clínicos de um atendimento
 */
export const getClinicalData = (appointmentId) => {
  const db = loadDb();
  if (!db.clinicalAppointments) {
    return null;
  }
  return db.clinicalAppointments.find((ca) => ca.appointmentId === appointmentId) || null;
};

/**
 * Registra evento clínico
 */
export const logClinicalEvent = (appointmentId, type, data = {}, userId = null) => {
  try {
    return withDb((db) => {
      if (!db.clinicalEvents) {
        db.clinicalEvents = [];
      }

      const event = {
        id: createId('event'),
        appointmentId,
        type,
        data,
        userId,
        timestamp: new Date().toISOString(),
      };

      db.clinicalEvents.push(event);
      return db;
    });
  } catch (error) {
    console.error('Erro ao registrar evento clínico:', error);
    // Retornar undefined em caso de erro para não quebrar o fluxo
    return undefined;
  }
};

/**
 * Obtém histórico de eventos de um atendimento
 */
export const getClinicalEvents = (appointmentId) => {
  const db = loadDb();
  if (!db.clinicalEvents) {
    return [];
  }
  return db.clinicalEvents
    .filter((e) => e.appointmentId === appointmentId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

/**
 * Status do orçamento
 */
export const BUDGET_STATUS = {
  RASCUNHO: 'RASCUNHO',
  ENVIADO: 'ENVIADO',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
};

/**
 * Cria ou atualiza orçamento de um atendimento
 */
export const saveBudget = (user, appointmentId, budgetData) => {
  return withDb((db) => {
    if (!db.clinicalAppointments) {
      db.clinicalAppointments = [];
    }

    const index = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );

    const clinicalData = index >= 0 
      ? { ...db.clinicalAppointments[index] }
      : {
          id: createId('clinical'),
          appointmentId,
          createdAt: new Date().toISOString(),
        };

    // Calcular valor total dos procedimentos
    const totalValue = (budgetData.procedures || []).reduce((sum, proc) => {
      return sum + (parseFloat(proc.quantity || 1) * parseFloat(proc.unitValue || 0));
    }, 0);

    clinicalData.budget = {
      ...budgetData,
      id: budgetData.id || clinicalData.budget?.id || createId('budget'),
      totalValue,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    if (!clinicalData.budget.createdAt) {
      clinicalData.budget.createdAt = new Date().toISOString();
      clinicalData.budget.createdBy = user.id;
    }

    clinicalData.updatedAt = new Date().toISOString();
    clinicalData.updatedBy = user.id;

    if (index >= 0) {
      db.clinicalAppointments[index] = clinicalData;
    } else {
      db.clinicalAppointments.push(clinicalData);
    }

    // Vincular observações (evoluções) deste atendimento que ainda não têm budgetId
    const budgetIdToLink = clinicalData.budget.id;
    if (db.clinicalEvolutions && budgetIdToLink) {
      db.clinicalEvolutions.forEach((e, i) => {
        if (e.appointmentId === appointmentId && !e.budgetId) {
          db.clinicalEvolutions[i] = { ...e, budgetId: budgetIdToLink };
        }
      });
    }

    // Registrar evento
    logClinicalEvent(appointmentId, 'budget_updated', {
      status: budgetData.status,
      totalValue,
      proceduresCount: (budgetData.procedures || []).length,
    }, user.id);

    return db;
  });
};

/**
 * Obtém orçamento de um atendimento
 */
export const getBudget = (appointmentId) => {
  const clinicalData = getClinicalData(appointmentId);
  return clinicalData?.budget || null;
};

/**
 * Atualiza status do orçamento
 */
export const updateBudgetStatus = (user, appointmentId, status, notes = '') => {
  return withDb((db) => {
    const clinicalData = getClinicalData(appointmentId);
    if (!clinicalData || !clinicalData.budget) {
      throw new Error('Orçamento não encontrado');
    }

    const index = db.clinicalAppointments.findIndex(
      (ca) => ca.appointmentId === appointmentId
    );

    if (index >= 0) {
      db.clinicalAppointments[index].budget = {
        ...db.clinicalAppointments[index].budget,
        status,
        statusNotes: notes,
        statusUpdatedAt: new Date().toISOString(),
        statusUpdatedBy: user.id,
      };
      db.clinicalAppointments[index].updatedAt = new Date().toISOString();
      db.clinicalAppointments[index].updatedBy = user.id;
    }

    // Registrar evento
    logClinicalEvent(appointmentId, 'budget_status_changed', {
      status,
      notes,
    }, user.id);

    return db;
  });
};
