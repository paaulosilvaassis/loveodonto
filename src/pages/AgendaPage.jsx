import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek, eachDayOfInterval } from 'date-fns';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import {
  APPOINTMENT_STATUS,
  cancelAppointment,
  createAppointment,
  listAppointments,
  listBlocks,
  updateAppointment,
} from '../services/appointmentService.js';
import { queueMessage, listTemplates } from '../services/communicationService.js';
import { getProfessionalOptions } from '../services/collaboratorService.js';
import { CalendarGrid } from '../components/agenda/CalendarGrid.jsx';
import { CalendarHeader } from '../components/agenda/CalendarHeader.jsx';
import { AgendaTimeline } from '../components/agenda/AgendaTimeline.jsx';
import { CreateAppointmentPanel } from '../components/agenda/CreateAppointmentPanel.jsx';
import { MonthGrid } from '../components/agenda/MonthGrid.jsx';
import { AppointmentDetailsModal } from '../components/agenda/AppointmentDetailsModal.jsx';
import { AppointmentStep1PatientSearchModal } from '../components/agenda/AppointmentStep1PatientSearchModal.jsx';
import { AppointmentStep2DetailsModal } from '../components/agenda/AppointmentStep2DetailsModal.jsx';
import { RescheduleConfirmModal } from '../components/agenda/RescheduleConfirmModal.jsx';
import { AGENDA_CONFIG } from '../utils/agendaConfig.js';
import {
  addMinutesToTime,
  diffMinutes,
  normalizeSlotCapacity,
  resolveWorkSchedule,
  toMinutes,
} from '../utils/agendaUtils.js';
import { canPlaceEvent } from '../utils/calendar/overlap.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { onlyDigits } from '../utils/validators.js';

// #region agent log
const statusOptions = Object.values(APPOINTMENT_STATUS).map((value) => {
  const config = AGENDA_CONFIG.status[value];
  const label = config?.label || value;
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:37',message:'statusOptions mapping',data:{value,hasConfig:!!config,label},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  return { value, label };
});
// #endregion

const todayIso = () => new Date().toISOString().slice(0, 10);

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTH_LABELS = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
];

export default function AgendaPage() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:61',message:'AgendaPage render start',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const { user } = useAuth();
  const location = useLocation();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:64',message:'useAuth result',data:{hasUser:!!user,userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  const [searchParams, setSearchParams] = useSearchParams();
  const [dbSnapshot, setDbSnapshot] = useState(() => {
    // #region agent log
    try {
      const db = loadDb();
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:75',message:'loadDb success',data:{hasDb:!!db,version:db?.version,appointmentsCount:db?.appointments?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      return db;
    } catch (err) {
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:75',message:'loadDb error',data:{error:err?.message,stack:err?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      throw err;
    }
    // #endregion
  });

  const [view, setView] = useState('semana');
  const [timelineInitialized, setTimelineInitialized] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [search, setSearch] = useState('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(() => {
    const stored = localStorage.getItem('agenda.selectedProfessionalId');
    return stored || '';
  });
  const [filters, setFilters] = useState({
    roomId: '',
    status: [],
  });
  const [panelState, setPanelState] = useState({
    open: false,
    mode: 'create',
    appointment: {},
  });
  const [step1ModalState, setStep1ModalState] = useState({
    open: false,
    slot: null,
  });
  const [step2ModalState, setStep2ModalState] = useState({
    open: false,
    step1Data: null,
  });
  const [detailsModalState, setDetailsModalState] = useState({
    open: false,
    appointmentId: null,
  });
  const [rescheduleModalState, setRescheduleModalState] = useState({
    open: false,
    appointment: null,
    newDate: null,
    newStartTime: null,
    newEndTime: null,
  });
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [dragOverEvent, setDragOverEvent] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const timelineStickyRef = useRef(null);
  const timelineRef = useRef(null);
  const prevViewRef = useRef(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const patients = dbSnapshot.patients;
  const patientPhones = dbSnapshot.patientPhones;
  const professionals = useMemo(() => {
    const collaborators = getProfessionalOptions();
    if (collaborators.length) return collaborators;
    return dbSnapshot.users
      .filter((item) => item.role === 'profissional')
      .map((item) => ({ id: item.id, name: item.name, specialty: '', avatarUrl: '' }));
  }, [dbSnapshot.users, dbSnapshot.collaborators]);

  // Validar e limpar seleção se profissional não existir mais
  useEffect(() => {
    if (selectedProfessionalId && !professionals.find((p) => p.id === selectedProfessionalId)) {
      setSelectedProfessionalId('');
      localStorage.removeItem('agenda.selectedProfessionalId');
    }
  }, [professionals, selectedProfessionalId]);

  // Auto-selecionar profissional se houver apenas 1 e nenhum selecionado
  useEffect(() => {
    if (professionals.length === 1 && !selectedProfessionalId) {
      setSelectedProfessionalId(professionals[0].id);
      localStorage.setItem('agenda.selectedProfessionalId', professionals[0].id);
    }
  }, [professionals, selectedProfessionalId]);

  // Persistir seleção em localStorage
  useEffect(() => {
    if (selectedProfessionalId) {
      localStorage.setItem('agenda.selectedProfessionalId', selectedProfessionalId);
    } else {
      localStorage.removeItem('agenda.selectedProfessionalId');
    }
  }, [selectedProfessionalId]);
  const rooms = dbSnapshot.rooms;

  const patientPhonesMap = useMemo(() => {
    return patientPhones.reduce((acc, phone) => {
      acc[phone.patient_id] = acc[phone.patient_id] || [];
      acc[phone.patient_id].push(phone);
      return acc;
    }, {});
  }, [patientPhones]);

  const patientsMap = useMemo(() => {
    return patients.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});
  }, [patients]);

  const patientDirectory = useMemo(() => {
    return patients.reduce((acc, patient) => {
      const phones = patientPhonesMap[patient.id] || [];
      const primary = phones.find((item) => item.is_primary) || phones[0];
      const phoneLabel = primary ? `(${primary.ddd}) ${primary.number}` : '';
      acc[patient.id] = {
        id: patient.id,
        name: patient.full_name || patient.nickname || patient.social_name || 'Paciente',
        cpf: patient.cpf || '',
        phoneLabel,
      };
      return acc;
    }, {});
  }, [patientPhonesMap, patients]);
  const professionalsMap = useMemo(
    () => professionals.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
    [professionals]
  );
  const roomsMap = useMemo(
    () => rooms.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
    [rooms]
  );

  const selectedWorkHours = useMemo(() => {
    if (!selectedProfessionalId) return [];
    return (dbSnapshot.collaboratorWorkHours || []).filter(
      (item) => item.collaboratorId === selectedProfessionalId
    );
  }, [dbSnapshot.collaboratorWorkHours, selectedProfessionalId]);

  const workHoursConfig = useMemo(() => {
    const activeDays = new Set(selectedWorkHours.filter((item) => item.ativo).map((item) => item.diaSemana));
    const rangesByWeekday = {};
    const isValidTime = (value) => /^\d{2}:\d{2}$/.test(value || '');
    const addRange = (ranges, startValue, endValue) => {
      if (!isValidTime(startValue) || !isValidTime(endValue)) return;
      const start = toMinutes(startValue);
      const end = toMinutes(endValue);
      if (end > start) ranges.push({ start, end });
    };
    selectedWorkHours.forEach((item) => {
      if (!item.ativo) return;
      const ranges = [];
      addRange(ranges, item.inicio, item.fim);
      addRange(ranges, item.intervaloInicio, item.intervaloFim);
      rangesByWeekday[item.diaSemana] = ranges;
    });
    return {
      hasConfig: selectedWorkHours.length > 0,
      activeDays,
      totalEntries: selectedWorkHours.length,
      rangesByWeekday,
    };
  }, [selectedWorkHours]);

  const workSchedule = useMemo(
    () =>
      resolveWorkSchedule({
        workHours: selectedWorkHours,
        fallbackStart: '08:00',
        fallbackEnd: '18:00',
        fallbackSlotMinutes: 30,
      }),
    [selectedWorkHours]
  );

  useEffect(() => {
    if (!selectedProfessionalId) {
      setWarning('');
      return;
    }
    if (!workSchedule.hasConfig) {
      setWarning('Horário do dentista não configurado, usando padrão.');
      return;
    }
    if (!workSchedule.isValid) {
      setWarning('Horário do dentista inválido, usando padrão.');
      return;
    }
    setWarning('');
  }, [selectedProfessionalId, workSchedule]);

  const workStartMinutes = toMinutes(workSchedule.workStart);
  const workEndMinutes = toMinutes(workSchedule.workEnd);
  const hasValidWorkHoursConfig = workHoursConfig.hasConfig && workSchedule.isValid;

 

  const isWorkingDay = (isoDate) => {
    const dayOfWeek = new Date(`${isoDate}T00:00:00`).getDay();
    // Por padrão: segunda a sexta (1-5) estão abertos, fim de semana (0,6) fechado
    if (!workHoursConfig.hasConfig) {
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    }
    // Se há configuração, verifica se o dia está configurado como ativo
    return workHoursConfig.activeDays.has(dayOfWeek);
  };

  const refresh = () => {
    setAppointments(listAppointments());
    setBlocks(listBlocks());
  };

  const refreshDb = () => {
    setDbSnapshot(loadDb());
  };

  useEffect(() => {
    refresh();
    refreshDb();
  }, []);

  useEffect(() => {
    if (location.pathname === '/gestao/agenda') {
      refresh();
      refreshDb();
    }
  }, [location.pathname]);

  // Sempre que mudar para view timeline (de outra view), seleciona o dia atual
  useEffect(() => {
    const prevView = prevViewRef.current;
    const isChangingToTimeline = prevView !== null && prevView !== 'timeline' && view === 'timeline';
    const isMountingWithTimeline = prevView === null && view === 'timeline';
    const isAlreadyInTimeline = prevView === 'timeline' && view === 'timeline';
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:307',message:'Timeline view change effect',data:{view,prevView,selectedDate,today:todayIso(),isChangingToTimeline,isMountingWithTimeline,isAlreadyInTimeline,timelineInitialized},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Só atualiza para hoje quando MUDA para timeline OU quando monta com timeline
    if (isChangingToTimeline || isMountingWithTimeline) {
      const today = todayIso();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:312',message:'Timeline detected - setting to today',data:{view,prevView,selectedDate,today,reason:isChangingToTimeline ? 'changing' : 'mounting'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Atualiza a data imediatamente (sem requestAnimationFrame) para que o scroll possa detectar
      setSelectedDate(today);
      setTimelineInitialized(true);
    } else if (view !== 'timeline') {
      setTimelineInitialized(false);
    }
    
    // Atualiza a ref para a próxima execução (sempre, após processar)
    prevViewRef.current = view;
  }, [view, timelineInitialized]);

  useEffect(() => {
    if (!selectedProfessionalId) return;
    refreshDb();
  }, [selectedProfessionalId]);

  // Verificar se há retorno da criação de paciente
  useEffect(() => {
    const returnPatientId = searchParams.get('returnPatientId');
    const slotDate = searchParams.get('slotDate');
    const startTime = searchParams.get('startTime');
    const returnProfessionalId = searchParams.get('professionalId');

    if (returnPatientId && slotDate && startTime) {
      // Limpar query params primeiro
      setSearchParams({});
      
      // Atualizar db snapshot para garantir que o paciente está disponível
      refreshDb();
      
      // Buscar o paciente recém-criado após um pequeno delay para garantir que o db foi atualizado
      setTimeout(() => {
        const updatedDb = loadDb();
        const newPatient = updatedDb.patients.find((p) => p.id === returnPatientId);
        if (newPatient) {
          // Selecionar profissional se necessário
          if (returnProfessionalId && returnProfessionalId !== selectedProfessionalId) {
            setSelectedProfessionalId(returnProfessionalId);
          }
          
          // Reabrir o fluxo de agendamento com o paciente selecionado
          // Ir direto para Step2 com o paciente já selecionado
          setStep2ModalState({
            open: true,
            step1Data: {
              appointmentType: 'consulta',
              patient: {
                id: newPatient.id,
                name: newPatient.full_name || newPatient.nickname || newPatient.social_name || 'Paciente',
                full_name: newPatient.full_name,
              },
              slot: { date: slotDate, time: startTime },
            },
          });
        }
      }, 200);
    }
  }, [searchParams, setSearchParams, selectedProfessionalId]);

  const dateObj = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const isWeekday = (date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  };
  const normalizeToWeekday = (date) => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 6) return addDays(date, 2);
    if (dayOfWeek === 0) return addDays(date, 1);
    return date;
  };
  const addWeekdays = (date, offset) => {
    const step = offset >= 0 ? 1 : -1;
    let remaining = Math.abs(offset);
    let current = new Date(date);
    while (remaining > 0) {
      current = addDays(current, step);
      if (isWeekday(current)) remaining -= 1;
    }
    return current;
  };
  const buildAllDaysInMonth = (centerDate) => {
    const date = new Date(centerDate);
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  };
  const weekStart = useMemo(() => startOfWeek(dateObj, { weekStartsOn: 1 }), [dateObj]);
  const weekEnd = useMemo(() => endOfWeek(dateObj, { weekStartsOn: 1 }), [dateObj]);
  const monthStart = useMemo(() => startOfMonth(dateObj), [dateObj]);
  const monthEnd = useMemo(() => endOfMonth(dateObj), [dateObj]);

  const selectedWeekdayIso = useMemo(
    () => normalizeToWeekday(new Date(`${selectedDate}T00:00:00`)).toISOString().slice(0, 10),
    [selectedDate]
  );
  const selectedWeekdayObj = useMemo(
    () => new Date(`${selectedWeekdayIso}T00:00:00`),
    [selectedWeekdayIso]
  );

  const timelineDates = useMemo(
    () => buildAllDaysInMonth(new Date(`${selectedDate}T00:00:00`)),
    [selectedDate]
  );
  const timelineStart = useMemo(
    () => (timelineDates.length ? timelineDates[0] : dateObj),
    [timelineDates, dateObj]
  );
  const timelineEnd = useMemo(
    () => (timelineDates.length ? timelineDates[timelineDates.length - 1] : dateObj),
    [timelineDates, dateObj]
  );

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:393',message:'Range calculation start',data:{view,hasSelectedWeekdayObj:!!selectedWeekdayObj,selectedWeekdayIso,hasMonthStart:!!monthStart,hasWeekStart:!!weekStart,hasTimelineStart:!!timelineStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  const rangeStart =
    view === 'mes'
      ? monthStart
      : view === 'semana'
      ? weekStart
      : view === 'timeline'
      ? timelineStart
      : selectedWeekdayObj;
  const rangeEnd =
    view === 'mes'
      ? monthEnd
      : view === 'semana'
      ? weekEnd
      : view === 'timeline'
      ? timelineEnd
      : selectedWeekdayObj;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:408',message:'Range calculation end',data:{view,hasRangeStart:!!rangeStart,hasRangeEnd:!!rangeEnd,rangeStartIso:rangeStart?.toISOString()?.slice(0,10) || null,rangeEndIso:rangeEnd?.toISOString()?.slice(0,10) || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const rangeStartIso = rangeStart.toISOString().slice(0, 10);
  const rangeEndIso = rangeEnd.toISOString().slice(0, 10);

  const filteredAppointments = useMemo(() => {
    const searchValue = debouncedSearch.trim();
    const searchLower = searchValue.toLowerCase();
    const searchDigits = onlyDigits(searchValue);

    return appointments.filter((item) => {
      if (item.date < rangeStartIso || item.date > rangeEndIso) return false;
      if (selectedProfessionalId && item.professionalId !== selectedProfessionalId) return false;
      if (filters.roomId && item.roomId !== filters.roomId) return false;
      if (filters.status.length && !filters.status.includes(item.status)) return false;
      if (!searchValue) return true;

      const patient = patientsMap[item.patientId];
      const patientName =
        patient?.full_name || patient?.nickname || patient?.social_name || item.leadDisplayName || '';
      const patientCpf = patient?.cpf || '';
      const phoneList = patientPhonesMap[item.patientId] || [];
      const phoneDigits = phoneList.map((phone) => `${onlyDigits(phone.ddd)}${onlyDigits(phone.number)}`);

      const searchTargets = [patientName, item.procedureName, item.notes].filter(Boolean).join(' ').toLowerCase();
      const matchesText = searchTargets.includes(searchLower);
      const matchesDigits =
        searchDigits &&
        (onlyDigits(patientCpf).includes(searchDigits) ||
          phoneDigits.some((digits) => digits.includes(searchDigits)));

      return matchesText || Boolean(matchesDigits);
    });
  }, [
    appointments,
    debouncedSearch,
    filters,
    rangeEndIso,
    rangeStartIso,
    selectedProfessionalId,
    patientsMap,
    patientPhonesMap,
  ]);

  const enrichedAppointments = useMemo(
    () =>
      filteredAppointments.map((item) => {
        const isFromCrmLead = item.leadId && (item.leadDisplayName || !item.patientId);
        const patient = item.patientId ? patientsMap[item.patientId] : null;
        const phones = patientPhonesMap[item.patientId] || [];
        const primaryPhone = phones.find((p) => p.is_primary) || phones[0];
        const phoneLast4 = primaryPhone?.number?.slice(-4) || '';
        const phoneDisplay = phoneLast4 ? `(…-${phoneLast4})` : '';
        const fullName = isFromCrmLead
          ? (item.leadDisplayName || `Lead ${item.leadId}`)
          : (patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente');
        const firstName = fullName.split(' ')[0];

        const enriched = {
          ...item,
          patientName: fullName,
          patientFirstName: firstName,
          patientPhone: phoneDisplay,
          professionalName: professionalsMap[item.professionalId]?.name || 'Profissional',
          roomName: roomsMap[item.roomId]?.name || 'Sala',
          durationMinutes: item.durationMinutes || diffMinutes(item.startTime, item.endTime),
          slotCapacity: normalizeSlotCapacity(item.slotCapacity),
        };
        return enriched;
      }),
    [filteredAppointments, patientsMap, patientPhonesMap, professionalsMap, roomsMap]
  );

  useEffect(() => {
    // #region agent log
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && enrichedAppointments.length > 0) {
      const sample = enrichedAppointments.slice(0, 3).map((a) => ({
        id: a.id,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        slotCapacity: a.slotCapacity,
        hasSlotCapacity: 'slotCapacity' in a,
      }));
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:453',message:'Enriched appointments sample',data:{total:enrichedAppointments.length,sample},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    }
    // #endregion
  }, [enrichedAppointments]);

  const timelineDays = useMemo(
    () =>
      timelineDates.map((date) => {
        const iso = date.toISOString().slice(0, 10);
        const dayOfWeek = date.getDay();
        const comparisonDate = view === 'timeline' ? selectedDate : selectedWeekdayIso;
        const isSelected = iso === comparisonDate;
        // #region agent log
        if (iso === selectedDate || iso === selectedWeekdayIso) {
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:543',message:'Timeline day selection check',data:{iso,view,selectedDate,selectedWeekdayIso,comparisonDate,isSelected},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        }
        // #endregion
        return {
          iso,
          weekday: WEEKDAY_LABELS[dayOfWeek],
          day: String(date.getDate()).padStart(2, '0'),
          month: MONTH_LABELS[date.getMonth()],
          isToday: iso === todayIso(),
          isSelected,
          dayOfWeek,
          isClosed: !isWorkingDay(iso),
        };
      }),
    [timelineDates, selectedWeekdayIso, selectedDate, view, workHoursConfig]
  );

  useEffect(() => {
    // #region agent log
    const selectedCount = timelineDays.filter((day) => day.isSelected).length;
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:474',message:'Timeline selection state',data:{view,selectedDate,selectedWeekdayIso,selectedCount,timelineCount:timelineDays.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }, [view, selectedDate, selectedWeekdayIso, timelineDays]);

  useEffect(() => {
    // #region agent log
    const timelineIsos = timelineDays.map((day) => day.iso);
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:482',message:'Timeline days list',data:{view,timelineCount:timelineIsos.length,firstIso:timelineIsos[0] || null,lastIso:timelineIsos[timelineIsos.length - 1] || null,timelineIsos},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
    // #endregion
  }, [view, timelineDays]);

  useEffect(() => {
    if (view === 'mes') return;
    let rafId = 0;
    rafId = requestAnimationFrame(() => {
      // #region agent log
      const selectedEl = document.querySelector('.agenda-timeline .timeline-day--selected');
      const numberEl = selectedEl?.querySelector('.timeline-day-number') || null;
      const numberStyles = numberEl ? getComputedStyle(numberEl) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:484',message:'Timeline selected styles',data:{hasSelected:Boolean(selectedEl),numberText:numberEl?.textContent || null,numberColor:numberStyles?.color || null,numberVisibility:numberStyles?.visibility || null,numberOpacity:numberStyles?.opacity || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const numberElAny = document.querySelector('.agenda-timeline .timeline-day-number');
      const numberAnyStyles = numberElAny ? getComputedStyle(numberElAny) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:492',message:'Timeline number styles sample',data:{sampleText:numberElAny?.textContent || null,sampleColor:numberAnyStyles?.color || null,sampleVisibility:numberAnyStyles?.visibility || null,sampleOpacity:numberAnyStyles?.opacity || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const selectedRect = selectedEl ? selectedEl.getBoundingClientRect() : null;
      const numberRect = numberEl ? numberEl.getBoundingClientRect() : null;
      const selectedStyles = selectedEl ? getComputedStyle(selectedEl) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:500',message:'Timeline selected layout',data:{selectedRect,numberRect,selectedOverflow:selectedStyles?.overflow || null,selectedDisplay:selectedStyles?.display || null,selectedVisibility:selectedStyles?.visibility || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const timelineEl = document.querySelector('.agenda-timeline');
      const timelineStyles = timelineEl ? getComputedStyle(timelineEl) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:508',message:'Timeline container styles',data:{timelineFound:Boolean(timelineEl),overflowX:timelineStyles?.overflowX || null,overflowY:timelineStyles?.overflowY || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const selectedComputedStyles = selectedEl ? getComputedStyle(selectedEl) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:512',message:'Timeline selected computed',data:{selectedClass:selectedEl?.className || null,selectedBg:selectedComputedStyles?.backgroundColor || null,selectedColor:selectedComputedStyles?.color || null,selectedOpacity:selectedComputedStyles?.opacity || null,selectedPointer:selectedComputedStyles?.pointerEvents || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const centerX = numberRect ? numberRect.left + numberRect.width / 2 : null;
      const centerY = numberRect ? numberRect.top + numberRect.height / 2 : null;
      const topEl = numberRect ? document.elementFromPoint(centerX, centerY) : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:516',message:'Timeline number hit test',data:{centerX,centerY,topTag:topEl?.tagName || null,topClass:topEl?.className || null,topText:topEl?.textContent?.slice(0,10) || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion

      // #region agent log
      const wrapperEl = document.querySelector('.agenda-timeline-wrapper');
      const timelineRect = timelineEl ? timelineEl.getBoundingClientRect() : null;
      const wrapperRect = wrapperEl ? wrapperEl.getBoundingClientRect() : null;
      const outOfTimeline =
        numberRect && timelineRect
          ? numberRect.top < timelineRect.top || numberRect.bottom > timelineRect.bottom
          : null;
      const outOfWrapper =
        numberRect && wrapperRect
          ? numberRect.top < wrapperRect.top || numberRect.bottom > wrapperRect.bottom
          : null;
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:528',message:'Timeline clipping check',data:{timelineRect,wrapperRect,numberRect,outOfTimeline,outOfWrapper},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
    });
    return () => cancelAnimationFrame(rafId);
  }, [view, timelineDays, selectedWeekdayIso]);

  useEffect(() => {
    if (view === 'mes') return;
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const logEdges = () => {
      const buttons = timelineEl.querySelectorAll('.timeline-day');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const firstRect = first ? first.getBoundingClientRect() : null;
      const lastRect = last ? last.getBoundingClientRect() : null;
      const timelineRect = timelineEl.getBoundingClientRect();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:546',message:'Timeline edge visibility',data:{scrollLeft:timelineEl.scrollLeft,clientWidth:timelineEl.clientWidth,scrollWidth:timelineEl.scrollWidth,timelineRect,firstRect,lastRect},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
    };
    logEdges();
    timelineEl.addEventListener('scroll', logEdges);
    return () => timelineEl.removeEventListener('scroll', logEdges);
  }, [view, timelineDays]);

  useEffect(() => {
    if (view === 'mes') return;
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const wrapperEl = document.querySelector('.agenda-timeline-wrapper');
    const stickyEl = document.querySelector('.agenda-timeline-sticky');
    const prevButton = wrapperEl?.querySelector('.timeline-nav-button') || null;
    const nextButton =
      wrapperEl?.querySelectorAll('.timeline-nav-button')?.[1] || null;
    const buttons = timelineEl.querySelectorAll('.timeline-day');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const timelineRect = timelineEl.getBoundingClientRect();
    const wrapperRect = wrapperEl ? wrapperEl.getBoundingClientRect() : null;
    const prevRect = prevButton ? prevButton.getBoundingClientRect() : null;
    const nextRect = nextButton ? nextButton.getBoundingClientRect() : null;
    const firstRect = first ? first.getBoundingClientRect() : null;
    const lastRect = last ? last.getBoundingClientRect() : null;
    const maxScrollLeft = timelineEl.scrollWidth - timelineEl.clientWidth;
    const atMin = timelineEl.scrollLeft <= 1;
    const atMax = timelineEl.scrollLeft >= maxScrollLeft - 1;
    const leftOverflow =
      firstRect && timelineRect ? timelineRect.left - firstRect.left : null;
    const rightOverflow =
      lastRect && timelineRect ? lastRect.right - timelineRect.right : null;
    const timelineStyles = getComputedStyle(timelineEl);
    const wrapperStyles = wrapperEl ? getComputedStyle(wrapperEl) : null;
    const stickyStyles = stickyEl ? getComputedStyle(stickyEl) : null;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:573',message:'Timeline edge metrics',data:{scrollLeft:timelineEl.scrollLeft,maxScrollLeft,atMin,atMax,leftOverflow,rightOverflow,timelineRect,wrapperRect,prevRect,nextRect,firstRect,lastRect,timelinePaddingLeft:timelineStyles.paddingLeft,timelinePaddingRight:timelineStyles.paddingRight,timelineOverflowX:timelineStyles.overflowX,timelineOverflowY:timelineStyles.overflowY,wrapperPaddingLeft:wrapperStyles?.paddingLeft || null,wrapperPaddingRight:wrapperStyles?.paddingRight || null,wrapperOverflow:wrapperStyles?.overflow || null,stickyOverflow:stickyStyles?.overflow || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
    // #endregion
  }, [view, timelineDays]);

  useEffect(() => {
    if (view === 'mes') return;
    const selectedEl = document.querySelector('.agenda-timeline .timeline-day--selected');
    if (!selectedEl) return;
    const selectedStyles = getComputedStyle(selectedEl);
    const numberEl = selectedEl.querySelector('.timeline-day-number');
    const numberStyles = numberEl ? getComputedStyle(numberEl) : null;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:596',message:'Timeline selected visual styles',data:{selectedBg:selectedStyles.backgroundColor,selectedBgImage:selectedStyles.backgroundImage,selectedShadow:selectedStyles.boxShadow,selectedColor:selectedStyles.color,selectedOpacity:selectedStyles.opacity,numberColor:numberStyles?.color || null,numberVisibility:numberStyles?.visibility || null,numberOpacity:numberStyles?.opacity || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
    // #endregion
  }, [view, timelineDays, selectedWeekdayIso]);

  useEffect(() => {
    if (view !== 'timeline') return;
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;

    // Usa triple requestAnimationFrame para garantir que o DOM está completamente atualizado
    // especialmente após mudanças de view e selectedDate
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Sempre prioriza o botão selecionado
          const targetEl = timelineEl.querySelector('.timeline-day--selected');
          if (!targetEl) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:710',message:'No selected element found for scroll',data:{view,selectedDate,hasTimelineEl:!!timelineEl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
            // #endregion
            return;
          }

          const timelineRect = timelineEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();
          
          // Calcula a posição do botão em relação ao container visível (viewport)
          const targetLeftRelative = targetRect.left - timelineRect.left;
          const targetWidth = targetRect.width;
          const targetCenterRelative = targetLeftRelative + targetWidth / 2;
          
          // Calcula o centro do container visível
          const containerCenter = timelineEl.clientWidth / 2;
          
          // Calcula quanto precisa scrollar para centralizar
          const scrollOffset = targetCenterRelative - containerCenter;
          const currentScroll = timelineEl.scrollLeft;
          const desiredScrollLeft = currentScroll + scrollOffset;
          
          // Limita o scroll dentro dos limites
          const maxScrollLeft = timelineEl.scrollWidth - timelineEl.clientWidth;
          const finalScrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:732',message:'Scrolling to selected day',data:{view,selectedDate,targetIso:targetEl.getAttribute('data-iso') || targetEl.textContent?.slice(0,10),currentScroll,finalScrollLeft,scrollOffset,targetLeftRelative,targetCenterRelative,containerCenter},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion

          timelineEl.scrollTo({
            left: finalScrollLeft,
            behavior: 'smooth'
          });
        });
      });
    });
  }, [view, timelineDays, selectedDate]);

  const days = useMemo(() => {
    if (view === 'timeline') {
      return timelineDays.map((day) => ({
        iso: day.iso,
        label: day.weekday,
        subtitle: `${day.day} ${day.month}`,
        isToday: day.isToday,
        isClosed: day.isClosed,
        dayOfWeek: day.dayOfWeek,
      }));
    }
    if (view === 'dia') {
      const label = selectedWeekdayObj.toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });
      return [
        {
          iso: selectedWeekdayIso,
          label,
          subtitle: 'Dia',
          isToday: selectedWeekdayIso === todayIso(),
          isClosed: !isWorkingDay(selectedWeekdayIso),
          dayOfWeek: selectedWeekdayObj.getDay(),
        },
      ];
    }
    // Por padrão mostra segunda a sexta (5 dias)
    // Se houver configuração de horários, inclui também os dias configurados do fim de semana
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const iso = date.toISOString().slice(0, 10);
      const dayOfWeek = date.getDay();
      
      // Sempre inclui segunda a sexta (1-5)
      // Fim de semana (0,6) só inclui se houver configuração de horários
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        weekDays.push({
          iso,
          label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
          subtitle: date.toLocaleDateString('pt-BR', { month: 'short' }),
          isToday: iso === todayIso(),
          isClosed: !isWorkingDay(iso),
          dayOfWeek,
        });
      } else if (workHoursConfig.hasConfig && workHoursConfig.activeDays.has(dayOfWeek)) {
        // Inclui fim de semana apenas se estiver configurado
        weekDays.push({
          iso,
          label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
          subtitle: date.toLocaleDateString('pt-BR', { month: 'short' }),
          isToday: iso === todayIso(),
          isClosed: !isWorkingDay(iso),
          dayOfWeek,
        });
      }
    }
    return weekDays;
  }, [view, selectedWeekdayIso, selectedWeekdayObj, weekStart, timelineDays, workHoursConfig]);

 

  const monthWeeks = useMemo(() => {
    if (view !== 'mes') return [];
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const weeks = [];
    let current = start;
    while (current <= end) {
      const week = [];
      for (let index = 0; index < 7; index += 1) {
        const day = addDays(current, index);
        const iso = day.toISOString().slice(0, 10);
        week.push({
          iso,
          dayLabel: String(day.getDate()),
          isToday: iso === todayIso(),
          isCurrentMonth: day.getMonth() === monthStart.getMonth(),
          isClosed: !isWorkingDay(iso),
        });
      }
      weeks.push(week);
      current = addDays(current, 7);
    }
    return weeks;
  }, [view, monthStart, monthEnd, workHoursConfig]);

  const dateLabel = useMemo(() => {
    if (view === 'mes') {
      return monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
    if (view === 'timeline') {
      return selectedWeekdayObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    }
    if (view === 'dia') {
      return selectedWeekdayObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    }
    const startLabel = weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `${startLabel} - ${endLabel}`;
  }, [view, selectedWeekdayObj, monthStart, weekStart, weekEnd]);

  const appointmentsByDate = useMemo(() => {
    return enrichedAppointments.reduce((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [enrichedAppointments]);

  const openCreatePanel = (prefill = {}) => {
    if (!professionals.length) {
      setError('Nenhum profissional cadastrado. Cadastre um colaborador para usar a agenda.');
      return;
    }
    const defaultProfessionalId = selectedProfessionalId || professionals[0]?.id || '';
    setPanelState({
      open: true,
      mode: 'create',
      appointment: {
        date: selectedDate,
        startTime: '',
        durationMinutes: AGENDA_CONFIG.durations[1],
        status: APPOINTMENT_STATUS.AGENDADO,
        professionalId: defaultProfessionalId,
        ...prefill,
      },
    });
    setError('');
  };

  const openEditPanel = (appointment) => {
    setPanelState({
      open: true,
      mode: 'edit',
      appointment: {
        ...appointment,
        durationMinutes: appointment.durationMinutes || diffMinutes(appointment.startTime, appointment.endTime),
      },
    });
    setError('');
  };

  const openDetailsModal = (appointmentId) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:openDetailsModal',message:'open details modal',data:{appointmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
    // #endregion
    setDetailsModalState({
      open: true,
      appointmentId,
    });
  };

  const closePanel = () => {
    setPanelState((prev) => ({ ...prev, open: false }));
    setError('');
  };

  const confirmAppointment = (appointment) => {
    const template = listTemplates().find((item) => item.name === 'Confirmação consulta');
    let queuedMessageId = '';
    if (template) {
      const queued = queueMessage(user, {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        templateId: template.id,
        channel: appointment.channel || 'whatsapp',
      });
      queuedMessageId = queued.id;
    }
    const confirmationLogs = appointment.confirmationLogs || [];
    updateAppointment(user, appointment.id, {
      status: APPOINTMENT_STATUS.CONFIRMADO,
      confirmationLogs: [
        ...confirmationLogs,
        {
          confirmedAt: new Date().toISOString(),
          userId: user.id,
          channel: appointment.channel || 'whatsapp',
          messageId: queuedMessageId || undefined,
        },
      ],
    });
  };

  const handleStep1Continue = (step1Data) => {
    setStep1ModalState({ open: false, slot: null });
    setStep2ModalState({
      open: true,
      step1Data,
    });
  };

  const handleStep2Submit = (draft) => {
    setError('');
    try {
      const endTime = draft.endTime || addMinutesToTime(draft.startTime, Number(draft.durationMinutes || 30));
      const slotCapacity = normalizeSlotCapacity(draft.slotCapacity);
      const candidate = {
        date: draft.date,
        startTime: draft.startTime,
        endTime,
        professionalId: draft.professionalId,
        roomId: draft.roomId,
        slotCapacity,
      };
      const validation = validateOverlap(candidate);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:814',message:'Step2 submit validation',data:{slotCapacity:draft.slotCapacity,normalized:slotCapacity,validationOk:validation.ok,validationMessage:validation.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      if (!validation.ok) {
        setError(validation.message);
        return;
      }
      const payload = {
        patientId: draft.patientId || '',
        professionalId: draft.professionalId,
        roomId: draft.roomId,
        date: draft.date,
        startTime: draft.startTime,
        endTime,
        durationMinutes: Number(draft.durationMinutes || 30),
        status: APPOINTMENT_STATUS.AGENDADO,
        procedureName: draft.procedureName,
        insurance: draft.insurance,
        channel: 'whatsapp',
        notes: draft.notes,
        slotCapacity,
      };
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:840',message:'Step2 submit payload',data:{slotCapacity,hasSlotCapacity:'slotCapacity' in payload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const appointment = createAppointment(user, payload);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:833',message:'Step2 created appointment',data:{id:appointment.id,slotCapacity:appointment.slotCapacity,hasSlotCapacity:'slotCapacity' in appointment},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      refresh();
      setStep2ModalState({ open: false, step1Data: null });
      // Abrir modal de detalhes após sucesso
      setDetailsModalState({
        open: true,
        appointmentId: appointment.id,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePanelSubmit = (draft) => {
    setError('');
    try {
      const endTime = draft.endTime || addMinutesToTime(draft.startTime, Number(draft.durationMinutes || 30));
      const slotCapacity = normalizeSlotCapacity(draft.slotCapacity);
      const candidate = {
        date: draft.date,
        startTime: draft.startTime,
        endTime,
        professionalId: draft.professionalId,
        roomId: draft.roomId,
        slotCapacity,
      };
      const validation = validateOverlap(candidate, panelState.mode === 'edit' ? draft.id : null);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:845',message:'Panel submit validation',data:{mode:panelState.mode,slotCapacity:draft.slotCapacity,normalized:slotCapacity,validationOk:validation.ok,validationMessage:validation.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      if (!validation.ok) {
        setError(validation.message);
        return;
      }
      const payload = {
        patientId: draft.patientId,
        professionalId: draft.professionalId,
        roomId: draft.roomId,
        date: draft.date,
        startTime: draft.startTime,
        endTime,
        durationMinutes: Number(draft.durationMinutes || 30),
        status: draft.confirmAfter ? APPOINTMENT_STATUS.CONFIRMADO : draft.status,
        procedureName: draft.procedureName,
        insurance: draft.insurance,
        channel: draft.channel,
        notes: draft.notes,
        slotCapacity,
      };
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:870',message:'Panel submit payload',data:{mode:panelState.mode,slotCapacity,hasSlotCapacity:'slotCapacity' in payload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const appointment =
        panelState.mode === 'edit'
          ? updateAppointment(user, draft.id, payload)
          : createAppointment(user, payload);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:866',message:'Panel created/updated appointment',data:{id:appointment.id,slotCapacity:appointment.slotCapacity,hasSlotCapacity:'slotCapacity' in appointment},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      if (draft.confirmAfter) {
        confirmAppointment(appointment);
      }
      refresh();
      closePanel();
      // Abrir modal de detalhes após sucesso
      setDetailsModalState({
        open: true,
        appointmentId: appointment.id,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEventAction = (action, appointment) => {
    setError('');
    try {
      if (action === 'confirm') {
        confirmAppointment(appointment);
      }
      if (action === 'cancel') {
        cancelAppointment(user, appointment.id, 'Cancelado via agenda');
      }
      if (action === 'reschedule') {
        openEditPanel(appointment);
        return;
      }
      if (action === 'message') {
        const template = listTemplates()[0];
        if (!template) {
          setError('Cadastre um template de mensagem para enviar.');
          return;
        }
        queueMessage(user, {
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          templateId: template.id,
          channel: appointment.channel || 'whatsapp',
        });
      }
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSlotClick = ({ date, time }) => {
    if (!professionals.length) {
      setError('Nenhum profissional cadastrado. Cadastre um colaborador para usar a agenda.');
      return;
    }
    setStep1ModalState({
      open: true,
      slot: { date, time },
    });
  };

  const validateOverlap = (candidate, excludeId = null) => {
    // Filtrar apenas agendamentos válidos (não cancelados, mesma data)
    const validAppointments = appointments.filter((item) => {
      if (item.status === APPOINTMENT_STATUS.CANCELADO) return false;
      if (item.date !== candidate.date) return false;
      return true;
    });
    
    const result = canPlaceEvent(validAppointments, candidate, excludeId);
    return {
      ok: result.ok,
      message: result.reason || '',
    };
  };

  const handleDragStart = (appointment, e) => {
    setDragOverSlot(null);
    setDragOverEvent(null);
  };

  const handleDragEnd = (appointment, e) => {
    setDragOverSlot(null);
    setDragOverEvent(null);
  };

  const handleDragOverEvent = (appointment, e) => {
    setDragOverEvent(appointment.id);
  };

  const handleDragLeaveEvent = (appointment, e) => {
    if (dragOverEvent === appointment.id) {
      setDragOverEvent(null);
    }
  };

  const handleDragOverSlotChange = (slotKey) => {
    setDragOverSlot(slotKey);
  };

  const handleDrop = ({ appointmentId, appointment, targetDate, targetTime, targetAppointment }) => {
    setDragOverSlot(null);
    setDragOverEvent(null);
    const originalAppointment = appointments.find((a) => a.id === appointmentId);
    if (!originalAppointment) {
      setError('Agendamento não encontrado.');
      return;
    }

    // Se drop foi sobre um evento existente, usar o horário desse evento
    let finalTargetDate = targetDate;
    let finalTargetTime = targetTime;
    
    if (targetAppointment) {
      finalTargetDate = targetAppointment.date;
      finalTargetTime = targetAppointment.startTime;
    }

    // Calcular novo horário mantendo a duração original
    const durationMinutes = diffMinutes(originalAppointment.startTime, originalAppointment.endTime);
    const newStartTime = finalTargetTime;
    const newEndTime = addMinutesToTime(finalTargetTime, durationMinutes);

    // Validar se o novo horário está dentro dos limites
    const startMinutes = toMinutes(newStartTime);
    const endMinutes = toMinutes(newEndTime);
    const configStart = workStartMinutes;
    const configEnd = workEndMinutes;

    if (startMinutes < configStart || endMinutes > configEnd) {
      setError('O novo horário está fora dos limites da agenda.');
      return;
    }

    // Se drop foi sobre evento existente, verificar se permite encaixe
    if (targetAppointment) {
      const targetCapacity = normalizeSlotCapacity(targetAppointment.slotCapacity);
      const draggedCapacity = normalizeSlotCapacity(originalAppointment.slotCapacity);
      
      // Se nenhum dos dois permite encaixe, sugerir ativar
      if (targetCapacity === 1 && draggedCapacity === 1) {
        setError('Para colocar dois agendamentos no mesmo horário, ative "Permitir encaixe" em pelo menos um deles.');
        return;
      }
      
      // Se o evento arrastado não permite encaixe mas o alvo sim, atualizar o arrastado para permitir
      if (targetCapacity === 2 && draggedCapacity === 1) {
        // Continuar com slotCapacity = 2 para o evento arrastado
      }
    }

    // Validar overlap antes de permitir drop
    const candidate = {
      date: finalTargetDate,
      startTime: newStartTime,
      endTime: newEndTime,
      professionalId: originalAppointment.professionalId,
      roomId: originalAppointment.roomId,
      slotCapacity: targetAppointment 
        ? Math.max(normalizeSlotCapacity(originalAppointment.slotCapacity), normalizeSlotCapacity(targetAppointment.slotCapacity))
        : normalizeSlotCapacity(originalAppointment.slotCapacity),
    };
    const validation = validateOverlap(candidate, appointmentId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:1015',message:'Drop validation',data:{appointmentId,targetDate:finalTargetDate,newStartTime,newEndTime,slotCapacity:candidate.slotCapacity,hasTargetAppointment:!!targetAppointment,validationOk:validation.ok,validationMessage:validation.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    // Abrir modal de confirmação
    setRescheduleModalState({
      open: true,
      appointment: originalAppointment,
      newDate: finalTargetDate,
      newStartTime,
      newEndTime,
      slotCapacity: candidate.slotCapacity, // Preservar slotCapacity atualizado
    });
  };

  const handleRescheduleConfirm = async () => {
    const { appointment, newDate, newStartTime, newEndTime, slotCapacity } = rescheduleModalState;
    if (!appointment || !newDate || !newStartTime || !newEndTime) {
      setError('Dados inválidos para reagendamento.');
      return;
    }

    try {
      setError('');
      await updateAppointment(user, appointment.id, {
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        slotCapacity: slotCapacity !== null ? normalizeSlotCapacity(slotCapacity) : normalizeSlotCapacity(appointment.slotCapacity),
      });
      refresh();
      refreshDb();
      setRescheduleModalState({
        open: false,
        appointment: null,
        newDate: null,
        newStartTime: null,
        newEndTime: null,
        slotCapacity: null,
      });
    } catch (err) {
      setError(err.message || 'Erro ao reagendar agendamento.');
    }
  };

  const handleRescheduleCancel = () => {
    setRescheduleModalState({
      open: false,
      appointment: null,
      newDate: null,
      newStartTime: null,
      newEndTime: null,
      slotCapacity: null,
    });
    setError('');
  };

  const handlePrev = () => {
    if (view === 'mes') {
      const previous = addDays(monthStart, -1);
      setSelectedDate(previous.toISOString().slice(0, 10));
      return;
    }
    const previous =
      view === 'semana' ? addDays(dateObj, -7) : addWeekdays(dateObj, -1);
    setSelectedDate(previous.toISOString().slice(0, 10));
  };

  const handleNext = () => {
    if (view === 'mes') {
      const next = addDays(monthEnd, 1);
      setSelectedDate(next.toISOString().slice(0, 10));
      return;
    }
    const next =
      view === 'semana' ? addDays(dateObj, 7) : addWeekdays(dateObj, 1);
    setSelectedDate(next.toISOString().slice(0, 10));
  };

  const handleTimelinePrev = () => {
    const previous = addDays(dateObj, -7);
    setSelectedDate(previous.toISOString().slice(0, 10));
  };

  const handleTimelineNext = () => {
    const next = addDays(dateObj, 7);
    setSelectedDate(next.toISOString().slice(0, 10));
  };

  // Wrapper para setView que sempre seleciona o dia atual quando muda para timeline
  const handleViewChange = (newView) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:1295',message:'View change handler called',data:{currentView:view,newView,willChangeToTimeline:newView === 'timeline',isChangingView:view !== newView,prevViewRef:prevViewRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    // Se está mudando para timeline (de outra view), sempre seleciona o dia atual
    if (newView === 'timeline' && view !== 'timeline') {
      const today = todayIso();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:1298',message:'Setting date to today for timeline',data:{today,currentSelectedDate:selectedDate},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Atualiza prevViewRef antes de mudar a view para que o useEffect detecte corretamente
      prevViewRef.current = view;
      setSelectedDate(today);
    }
    setView(newView);
  };

  return (
    <div className="agenda-page">
      <div className="agenda-page-header">
        <h1 className="agenda-page-title">Agendamentos</h1>
      </div>
        <CalendarHeader
          view={view}
          onViewChange={handleViewChange}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onToday={() => setSelectedDate(todayIso())}
          onPrev={handlePrev}
          onNext={handleNext}
          onCreate={() => openCreatePanel()}
          onCreateDisabled={!professionals.length}
          searchValue={search}
          onSearchChange={setSearch}
          dateLabel={dateLabel}
          professionals={professionals}
          selectedProfessionalId={selectedProfessionalId}
          onProfessionalChange={setSelectedProfessionalId}
          rooms={rooms}
          statusOptions={statusOptions}
          filters={filters}
          onFiltersChange={setFilters}
        />
      {view !== 'mes' && timelineDays.length > 0 && (
        <AgendaTimeline
          timelineDays={timelineDays}
          onPrev={handleTimelinePrev}
          onNext={handleTimelineNext}
          onSelectDate={(date) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:1289',message:'Timeline day selected',data:{date,view,timelineInitialized,today:todayIso()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            // Permite seleção manual de dias na timeline
            setSelectedDate(date);
          }}
          timelineRef={timelineRef}
        />
      )}
      {!professionals.length ? (
        <div className="agenda-empty-state">
          <div className="card">
            <p>
              <strong>Nenhum profissional cadastrado.</strong>
            </p>
            <p className="muted">
              Cadastre um colaborador com cargo "Dentista" ou "Ortodontista" para usar a agenda.
            </p>
          </div>
        </div>
      ) : !selectedProfessionalId ? (
        <div className="agenda-empty-state">
          <div className="card">
            <p>
              <strong>Selecione um profissional</strong>
            </p>
            <p className="muted">Selecione um profissional no topo para visualizar a agenda.</p>
          </div>
        </div>
      ) : (
        <div className="agenda-body">
        <div className="agenda-main">
          {error ? <div className="error">{error}</div> : null}
          {warning ? <div className="warning">{warning}</div> : null}

          {view === 'mes' ? (
            <MonthGrid
              weeks={monthWeeks}
              appointmentsByDate={appointmentsByDate}
              statusStyles={AGENDA_CONFIG.status}
              onDayClick={(iso) => {
                setView('dia');
                setSelectedDate(iso);
              }}
              onEventSelect={(appointment) => openDetailsModal(appointment.id)}
            />
          ) : (
            <CalendarGrid
              days={days}
              startMinutes={workStartMinutes}
              endMinutes={workEndMinutes}
              slotMinutes={workSchedule.slotMinutes}
              appointments={enrichedAppointments}
              blocks={blocks}
              statusStyles={AGENDA_CONFIG.status}
              hasWorkHoursConfig={hasValidWorkHoursConfig}
              workHoursByWeekday={workHoursConfig.rangesByWeekday}
              onSlotClick={handleSlotClick}
              onEventSelect={(appointment) => openDetailsModal(appointment.id)}
              onEventAction={handleEventAction}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              dragOverSlot={dragOverSlot}
              onDragOverSlotChange={handleDragOverSlotChange}
              dragOverEvent={dragOverEvent}
              onDragOverEvent={handleDragOverEvent}
              onDragLeaveEvent={handleDragLeaveEvent}
            />
          )}
        </div>
      </div>
      )}

      {professionals.length > 0 && (
        <CreateAppointmentPanel
          open={panelState.open}
          mode={panelState.mode}
          appointment={panelState.appointment}
          patientDirectory={patientDirectory}
          professionals={professionals}
          rooms={rooms}
          durationOptions={AGENDA_CONFIG.durations}
          statusOptions={statusOptions}
          channels={AGENDA_CONFIG.channels}
          user={user}
          onPatientCreated={refreshDb}
          onClose={closePanel}
          onSubmit={handlePanelSubmit}
          error={error}
        />
      )}

      <AppointmentStep1PatientSearchModal
        open={step1ModalState.open}
        slot={step1ModalState.slot}
        selectedProfessionalId={selectedProfessionalId}
        onClose={() => setStep1ModalState({ open: false, slot: null })}
        onContinue={handleStep1Continue}
      />

      <AppointmentStep2DetailsModal
        open={step2ModalState.open}
        step1Data={step2ModalState.step1Data}
        selectedProfessionalId={selectedProfessionalId}
        onClose={() => setStep2ModalState({ open: false, step1Data: null })}
        onSubmit={handleStep2Submit}
        error={error}
      />

      <AppointmentDetailsModal
        open={detailsModalState.open}
        appointmentId={detailsModalState.appointmentId}
        onClose={() => setDetailsModalState({ open: false, appointmentId: null })}
        onReschedule={(prefill) => {
          setDetailsModalState({ open: false, appointmentId: null });
          openCreatePanel(prefill);
        }}
        onUpdate={() => {
          refresh();
          refreshDb();
        }}
      />

      <RescheduleConfirmModal
        open={rescheduleModalState.open}
        onClose={handleRescheduleCancel}
        onConfirm={handleRescheduleConfirm}
        appointment={rescheduleModalState.appointment}
        newDate={rescheduleModalState.newDate}
        newStartTime={rescheduleModalState.newStartTime}
        newEndTime={rescheduleModalState.newEndTime}
      />
      {/* #region agent log */}
      {(() => {
        try {
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:return',message:'AgendaPage render complete',data:{view,appointmentsCount:appointments.length,blocksCount:blocks.length,hasSelectedProfessional:!!selectedProfessionalId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        } catch (err) {
          fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AgendaPage.jsx:return',message:'AgendaPage render error',data:{error:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        }
        return null;
      })()}
      {/* #endregion */}
    </div>
  );
}
