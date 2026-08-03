import ClinicCompactHeader from './ClinicCompactHeader.jsx';
import ClinicSidebarNav from './ClinicSidebarNav.jsx';
import Button from '../../Button.jsx';
import { Save, X } from 'lucide-react';

export default function ClinicRecordShell({
  headerProps,
  activeSection,
  onSectionChange,
  hasUnsavedChanges = false,
  toastMessage = '',
  errorMessage = '',
  successMessage = '',
  onDiscard,
  onSave,
  children,
}) {
  return (
    <div className="clinic-settings-v2">
      {toastMessage || successMessage ? (
        <div className="clinic-toast clinic-toast--success" role="status">{toastMessage || successMessage}</div>
      ) : null}

      <ClinicCompactHeader {...headerProps} />

      <div className="clinic-body">
        <ClinicSidebarNav active={activeSection} onChange={onSectionChange} />
        <main className="clinic-main">
          {errorMessage ? <div className="error clinic-main__alert">{errorMessage}</div> : null}
          {children}
        </main>
      </div>

      {hasUnsavedChanges ? (
        <div className="clinic-unsaved-bar" role="status">
          <span>Você possui alterações não salvas</span>
          <div className="clinic-unsaved-bar__actions">
            <Button variant="ghost" size="sm" icon={X} onClick={onDiscard}>Descartar</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={onSave}>Salvar alterações</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
