<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'success' | 'ghost'
type Size = 'sm' | 'md'

const {
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled = false,
} = defineProps<{
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit'
  disabled?: boolean
}>()

const variantClasses: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700',
  secondary:
    'border border-slate-600 text-slate-100 hover:border-slate-400 disabled:border-slate-800 disabled:text-slate-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-slate-700',
  ghost: 'text-slate-300 hover:bg-slate-800 hover:text-white disabled:text-slate-600',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed"
    :class="[variantClasses[variant], sizeClasses[size]]"
  >
    <slot />
  </button>
</template>
