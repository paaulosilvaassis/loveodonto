import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Section } from '../../components/Section.jsx';
import { SectionCard } from '../../components/SectionCard.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { ClinicalGuideModal } from '../../components/clinical/guide/ClinicalGuideModal.jsx';

export default function ClinicalGuidesAdminPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  return (
    <div className="stack">
      <Section title="Guia Clínico do Dentista">
        <SectionCard>
          <div className="clinical-guides-admin-intro">
            <BookOpen size={32} aria-hidden />
            <div>
              <h2>Biblioteca de tratamentos</h2>
              <p>
                Gerencie guias educativos para apresentação ao paciente durante orçamentos e atendimentos.
                Guias padrão podem ser duplicados e personalizados pela clínica.
              </p>
              <button type="button" className="button primary" onClick={() => setOpen(true)}>
                Abrir biblioteca de guias
              </button>
            </div>
          </div>
        </SectionCard>
      </Section>

      <ClinicalGuideModal open={open} onOpenChange={setOpen} user={user} />
    </div>
  );
}
