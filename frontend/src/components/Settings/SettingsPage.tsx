import { useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/store/AuthContext'
import { useToast } from '@/store/ToastContext'

export default function SettingsPage() {
  const { user, updateUser } = useAuth()
  const { addToast } = useToast()
  const [email, setEmail] = useState(user?.email ?? '')
  const [marketingConsent, setMarketingConsent] = useState(user?.marketing_consent ?? false)
  const [saving, setSaving] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await api.auth.updateProfile({
        email: email.trim() || undefined,
        marketing_consent: marketingConsent,
      })
      updateUser(updated)
      addToast('Profil zaktualizowany', 'success')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zapisu', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      addToast('Nowe hasła nie są zgodne', 'error')
      return
    }
    if (newPassword.length < 6) {
      addToast('Hasło musi mieć co najmniej 6 znaków', 'error')
      return
    }
    setChangingPassword(true)
    try {
      await api.auth.changePassword(currentPassword, newPassword)
      addToast('Hasło zmienione', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Błąd zmiany hasła', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ustawienia</h1>

      <section className="rounded-lg border border-border bg-white p-6 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Profil</h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nazwa użytkownika
            </label>
            <input
              type="text"
              value={user?.username ?? ''}
              disabled
              className="input cursor-not-allowed opacity-60"
            />
            <p className="mt-1 text-xs text-gray-500">Nazwy użytkownika nie można zmienić</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Adres e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={e => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Chcę otrzymywać informacje marketingowe
            </span>
          </label>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Zapisywanie...' : 'Zapisz profil'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-white p-6 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Zmień hasło</h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Obecne hasło
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="input"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nowe hasło
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Potwierdź nowe hasło
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="input"
              required
              minLength={6}
            />
          </div>
          <button type="submit" disabled={changingPassword} className="btn btn-primary">
            {changingPassword ? 'Zmiana...' : 'Zmień hasło'}
          </button>
        </form>
      </section>
    </div>
  )
}