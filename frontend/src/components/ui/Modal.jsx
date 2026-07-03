// Usage:
// <Modal
//   isOpen={showModal}
//   onClose={() => setShowModal(false)}
//   title="Confirm Delete"
//   actions={
//     <>
//       <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
//       <Button variant="danger" onClick={handleDelete}>Delete</Button>
//     </>
//   }
// >
//   <p>Are you sure you want to delete this paper?</p>
// </Modal>

import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'
import AppIcon from './AppIcon'

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

export default function Modal({ isOpen, onClose, title, children, actions, size = 'md' }) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-[rgba(3,10,20,0.45)] backdrop-blur-md" aria-hidden="true" />
        </TransitionChild>

        {/* Panel */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              className={[
                `glass-panel glass-premium panel-outline w-full ${sizeMap[size] || sizeMap.md} rounded-shell`,
                'outline-none',
              ].join(' ')}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b surface-divider bg-primary/30">
                {title && (
                  <DialogTitle className="text-sm font-semibold text-[var(--text-primary)] font-display">
                    {title}
                  </DialogTitle>
                )}
                <button
                  onClick={onClose}
                  className="ml-auto rounded-xl p-2 text-[var(--text-secondary)] hover:bg-primary/60 hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Close modal"
                >
                  <AppIcon name="close" size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 text-sm text-[var(--text-primary)]">{children}</div>

              {/* Footer */}
              {actions && (
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t surface-divider bg-primary/24">
                  {actions}
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
