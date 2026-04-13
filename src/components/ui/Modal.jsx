import { forwardRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';

const sizeClassByVariant = {
  sm: 'app-modal__content--sm',
  md: 'app-modal__content--md',
  lg: 'app-modal__content--lg',
  xl: 'app-modal__content--xl',
};

const ModalRoot = Dialog.Root;
const ModalTrigger = Dialog.Trigger;
const ModalClose = Dialog.Close;

const ModalOverlay = forwardRef(function ModalOverlay({ className, ...props }, ref) {
  return <Dialog.Overlay ref={ref} className={clsx('app-modal__overlay', className)} {...props} />;
});

const ModalContent = forwardRef(function ModalContent(
  { className, children, size = 'md', overlayClassName, positionerClassName, ...props },
  ref
) {
  return (
    <Dialog.Portal>
      <ModalOverlay className={overlayClassName} />
      <div className={clsx('app-modal__positioner', positionerClassName)}>
        <Dialog.Content
          ref={ref}
          className={clsx('app-modal__content', sizeClassByVariant[size] || sizeClassByVariant.md, className)}
          {...props}
        >
          {children}
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  );
});

function ModalHeader({ className, ...props }) {
  return <div className={clsx('app-modal__header', className)} {...props} />;
}

const ModalBody = forwardRef(function ModalBody({ className, ...props }, ref) {
  return <div ref={ref} className={clsx('app-modal__body', className)} {...props} />;
});

function ModalFooter({ className, ...props }) {
  return <div className={clsx('app-modal__footer', className)} {...props} />;
}

const ModalTitle = forwardRef(function ModalTitle({ className, ...props }, ref) {
  return <Dialog.Title ref={ref} className={clsx('app-modal__title', className)} {...props} />;
});

const ModalDescription = forwardRef(function ModalDescription({ className, ...props }, ref) {
  return <Dialog.Description ref={ref} className={clsx('app-modal__description', className)} {...props} />;
});

export {
  ModalBody,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalRoot,
  ModalTitle,
  ModalTrigger,
};
