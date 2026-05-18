import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'

type RootProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
type ImageProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
type FallbackProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>

function Avatar({ className, ...props }: RootProps) {
    return (
        <AvatarPrimitive.Root
            className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
            {...props}
        />
    )
}

function AvatarImage({ className, ...props }: ImageProps) {
    return (
        <AvatarPrimitive.Image className={cn('aspect-square size-full', className)} {...props} />
    )
}

function AvatarFallback({ className, ...props }: FallbackProps) {
    return (
        <AvatarPrimitive.Fallback
            className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)}
            {...props}
        />
    )
}

export { Avatar, AvatarImage, AvatarFallback }
