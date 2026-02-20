import { Section } from '../components/Section.jsx';
import { SectionCard } from '../components/SectionCard.jsx';

export default function PatientChartPlaceholder() {
  return (
    <div className="stack">
      <Section title="Prontuário do Paciente">
        <SectionCard>
          <div className="alert warning">Prontuário em reconstrução. Em breve.</div>
        </SectionCard>
      </Section>
    </div>
  );
}
