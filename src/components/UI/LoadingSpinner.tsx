interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-7 h-7 border-2',
  lg: 'w-10 h-10 border-3',
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  return (
    <div
      className={`inline-block rounded-full border-slate-700 border-t-teal-400 animate-spin ${sizeMap[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
