import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { Fragment } from 'react'
import AppIcon from './AppIcon'

export default function Drawer({ isOpen, onClose, title, children, width = '55vw' }) {
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

        {/* Sliding Panel */}
        <div className="fixed inset-0 overflow-hidden">
          <TransitionChild
            as={Fragment}
            enter="transform transition ease-out duration-300"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition ease-in duration-200"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <DialogPanel
              className="fixed right-0 top-0 h-full glass-panel glass-premium panel-outline flex flex-col"
              style={{ width, maxWidth: '90vw', minWidth: '360px' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b surface-divider bg-primary/30 flex-shrink-0">
                {title && (
                  <DialogTitle className="text-sm font-semibold text-[var(--text-primary)] font-display">
                    {title}
                  </DialogTitle>
                )}
                <button
                  onClick={onClose}
                  className="ml-auto rounded-xl p-2 text-[var(--text-secondary)] hover:bg-primary/60 hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Close drawer"
                >
                  <AppIcon name="close" size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">{children}</div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
