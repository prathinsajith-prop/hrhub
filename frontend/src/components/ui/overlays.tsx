import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from './button'

// ─── Dialog ──────────────────────────────────────────────────────────────────
const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const DialogPortal = DialogPrimitive.Portal

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }
>(({ className, children, size = 'md', ...props }, ref) => {
  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }[size]

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-0 border border-border bg-card shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-xl overflow-hidden',
          sizeClass, className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 p-6 pb-4 border-b border-border', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4 border-t border-border bg-muted/30', className)} {...props} />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6', className)} {...props} />
)

// ─── AlertDialog (Confirmation) ──────────────────────────────────────────────
const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-0 border border-border bg-card shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-xl overflow-hidden',
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pb-4', className)} {...props} />
)

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-6 pt-0', className)} {...props} />
)

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground mt-2', className)} {...props} />
))
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants({ variant: 'destructive' }), className)} {...props} />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: 'outline' }), className)} {...props} />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

// Convenience component for danger confirmations
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: 'destructive' | 'warning'
}

function ConfirmDialog({
  open, onOpenChange, title, description,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, variant = 'destructive'
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', variant === 'destructive' ? 'bg-red-100' : 'bg-amber-100')}>
              <AlertTriangle className={cn('h-5 w-5', variant === 'destructive' ? 'text-red-600' : 'text-amber-600')} />
            </div>
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={cn(buttonVariants({ variant: variant === 'destructive' ? 'destructive' : 'warning' }))}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const ToastProvider = ToastPrimitive.Provider
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn('fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-4 sm:right-4 sm:top-auto sm:flex-col md:max-w-[420px] gap-2', className)}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

const toastVariants = {
  success: { bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> },
  error: { bg: 'bg-red-50 border-red-200', icon: <XCircle className="h-5 w-5 text-red-600 shrink-0" /> },
  warning: { bg: 'bg-amber-50 border-amber-200', icon: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" /> },
  info: { bg: 'bg-blue-50 border-blue-200', icon: <Info className="h-5 w-5 text-blue-600 shrink-0" /> },
}

interface ToastData {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  description?: string
}

// Global toast store
let toastListeners: ((toasts: ToastData[]) => void)[] = []
let toastList: ToastData[] = []

export const toast = {
  success: (title: string, description?: string) => addToast('success', title, description),
  error: (title: string, description?: string) => addToast('error', title, description),
  warning: (title: string, description?: string) => addToast('warning', title, description),
  info: (title: string, description?: string) => addToast('info', title, description),
}

function addToast(type: ToastData['type'], title: string, description?: string) {
  const id = `toast-${Date.now()}`
  toastList = [{ id, type, title, description }, ...toastList]
  toastListeners.forEach(l => l([...toastList]))
  setTimeout(() => {
    toastList = toastList.filter(t => t.id !== id)
    toastListeners.forEach(l => l([...toastList]))
  }, 4000)
}

function Toaster() {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  React.useEffect(() => {
    toastListeners.push(setToasts)
    return () => { toastListeners = toastListeners.filter(l => l !== setToasts) }
  }, [])

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(t => {
        const v = toastVariants[t.type]
        return (
          <ToastPrimitive.Root
            key={t.id}
            className={cn('group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full', v.bg)}
            open
          >
            {v.icon}
            <div className="flex-1 min-w-0">
              <ToastPrimitive.Title className="text-sm font-semibold text-foreground">{t.title}</ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-xs text-muted-foreground mt-0.5">{t.description}</ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

export {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose, DialogBody,
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel, ConfirmDialog,
  Toaster,
}
