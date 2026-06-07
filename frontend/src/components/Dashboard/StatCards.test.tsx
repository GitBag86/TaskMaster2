import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCards from './StatCards'

describe('StatCards', () => {
  const defaultProps = {
    total: 42,
    completed: 20,
    pending: 15,
    overdue: 7,
    completionRate: 48,
  }

  it('renders all five stat cards', () => {
    render(<StatCards {...defaultProps} />)
    expect(screen.getByText('Wszystkie')).toBeInTheDocument()
    expect(screen.getByText('Zakończone')).toBeInTheDocument()
    expect(screen.getByText('W toku')).toBeInTheDocument()
    expect(screen.getByText('Zaległe')).toBeInTheDocument()
    expect(screen.getByText('Ukończenie')).toBeInTheDocument()
  })

  it('displays the correct values', () => {
    render(<StatCards {...defaultProps} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
  })

  it('handles zero values', () => {
    render(<StatCards total={0} completed={0} pending={0} overdue={0} completionRate={0} />)
    const zeroElements = screen.getAllByText('0')
    expect(zeroElements.length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('handles large numbers', () => {
    render(<StatCards total={99999} completed={50000} pending={40000} overdue={9999} completionRate={50} />)
    expect(screen.getByText('99999')).toBeInTheDocument()
    expect(screen.getByText('50000')).toBeInTheDocument()
  })
})
