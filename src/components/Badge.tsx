import type { ReactNode } from 'react'
import { badgeClass, type BadgeVariant } from './badge-styles'

/** 状態のバッジ（rev 9章）。意味は variant で渡す。クラスの組み立ては badge-styles.ts */
export function Badge(props: { variant: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span className={`${badgeClass(props.variant)}${props.className === undefined ? '' : ` ${props.className}`}`}>
      {props.children}
    </span>
  )
}
