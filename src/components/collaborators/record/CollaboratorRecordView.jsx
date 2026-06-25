import CollaboratorCompactHeader from './CollaboratorCompactHeader.jsx';
import CollaboratorSidebarNav from './CollaboratorSidebarNav.jsx';
import { RecordBreadcrumb, RecordSkeleton, SaveToast } from './RecordUi.jsx';
import Button from '../../Button.jsx';
import { Save, X } from 'lucide-react';

export default function CollaboratorRecordView({
  loading = false,
  displayName,
  headerProps,
  activeTab,
  onTabChange,
  hasUnsavedChanges = false,
  accessDirty = false,
  toastMessage = '',
  errorMessage = '',
  menuItems = [],
  onBack,
  onDiscard,
  onSave,
  children,
}) {
  const showBar = hasUnsavedChanges || accessDirty;

  if (loading) {
    return (
      <div className="cr-shell">
        <RecordBreadcrumb onBack={onBack} />
        <RecordSkeleton />
      </div>
    );
  }

  return (
    <div className="cr-shell">
      <RecordBreadcrumb onBack={onBack} name={displayName} />
      <SaveToast message={toastMessage} type="success" />

      <CollaboratorCompactHeader {...headerProps} menuItems={menuItems} />

      <div className="cr-body">
        <CollaboratorSidebarNav active={activeTab} onChange={onTabChange} />
        <main className="cr-main">
          {errorMessage ? <div className="error cr-main__alert">{errorMessage}</div> : null}
          {children}
        </main>
      </div>

      {showBar ? (
        <div className="cr-unsaved-bar" role="status">
          <span>Você possui alterações não salvas</span>
          <div className="cr-unsaved-bar__actions">
            <Button variant="ghost" size="sm" icon={X} onClick={onDiscard}>Descartar</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={onSave}>Salvar alterações</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
