// Usage:
// <Card title="Paper Details" actions={<Button size="sm">Edit</Button>}>
//   <p>Content here</p>
// </Card>
// <Card className="p-6">Minimal card</Card>

const surfaceClasses = {
  subtle: 'glass-subtle',
  medium: 'glass-medium',
  premium: 'glass-premium',
}

export default function Card({
  title,
  actions,
  children,
  className = '',
  surface = 'medium',
  headerClassName = '',
  bodyClassName = '',
}) {
  const hasHeader = title || actions

  return (
    <div
      className={[
        'glass-panel panel-outline rounded-glass transition-all duration-300 hover:-translate-y-0.5 hover:shadow-premium',
        surfaceClasses[surface] || surfaceClasses.medium,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasHeader && (
        <div
          className={[
            'flex items-center justify-between gap-3 px-5 py-4 border-b surface-divider bg-primary/35',
            headerClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {title && <h3 className="text-[15px] font-semibold leading-6 text-primary tracking-tight">{title}</h3>}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className={['p-5', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  )
}
