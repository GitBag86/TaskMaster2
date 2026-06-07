import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useAuth } from '@/store/AuthContext'
import { useToast } from '@/store/ToastContext'

interface FieldErrors {
  username?: string;
  password?: string;
  email?: string;
  accept_terms?: string;
  accept_privacy?: string;
  _schema?: string;
}

type SignupInfo = {
  mode: 'disabled' | 'invite_only' | 'default_team';
  team_name?: string;
  token_valid?: boolean;
};

export default function AuthPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [signupInfoLoading, setSignupInfoLoading] = useState(true);
  const [signupInfo, setSignupInfo] = useState<SignupInfo | null>(null);
  const [signupInfoError, setSignupInfoError] = useState<string | null>(null);
  const { login, signup } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteToken = useMemo(
    () => new URLSearchParams(location.search).get('token'),
    [location.search],
  );

  useEffect(() => {
    if (inviteToken) {
      setIsSignup(true);
    }

    let cancelled = false;
    setSignupInfoLoading(true);
    setSignupInfoError(null);

    api.signup.info(inviteToken)
      .then(info => {
        if (!cancelled) setSignupInfo(info);
      })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Nie udało się sprawdzić rejestracji';
        setSignupInfoError(message);
        setSignupInfo(null);
      })
      .finally(() => {
        if (!cancelled) setSignupInfoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const canShowSignupForm = !isSignup || (
    signupInfo?.mode === 'default_team' ||
    (signupInfo?.mode === 'invite_only' && Boolean(inviteToken) && signupInfo.token_valid !== false)
  );

  const signupNotice = getSignupNotice(signupInfo, inviteToken, signupInfoError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup && !canShowSignupForm) return;
    setLoading(true);
    try {
      if (isSignup) {
        const createdUser = await signup({
          username: username.trim(),
          password,
          email: email.trim(),
          accept_terms: acceptTerms,
          accept_privacy: acceptPrivacy,
          accept_marketing: acceptMarketing,
          invite_token: inviteToken,
        });
        addToast('Rejestracja pomyślna', 'success');
        navigate(createdUser.role === 'super_admin' ? '/admin/teams' : '/');
      } else {
        const loggedUser = await login(username, password);
        addToast('Logowanie pomyślne', 'success');
        navigate(loggedUser.role === 'super_admin' ? '/admin/teams' : '/');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && typeof err.body === 'object' && err.body !== null) {
        const body = err.body as Record<string, unknown>;
        const extracted: FieldErrors = {};
        if (body.username) extracted.username = String(body.username);
        if (body.password) extracted.password = String(body.password);
        if (body.email) extracted.email = String(body.email);
        if (body.accept_terms) extracted.accept_terms = String(body.accept_terms);
        if (body.accept_privacy) extracted.accept_privacy = String(body.accept_privacy);
        if (body.error) extracted._schema = String(body.error);
        if (body._schema) extracted._schema = String(body._schema);
        if (Object.keys(extracted).length > 0) {
          setFieldErrors(extracted);
        } else {
          addToast(err.message, 'error');
        }
      } else {
        addToast(err instanceof Error ? err.message : 'Błąd autoryzacji', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 px-4 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-900">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {isSignup ? 'Utwórz konto' : 'Witaj ponownie'}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {isSignup ? 'Wypełnij formularz rejestracji' : 'Zaloguj się do swojego konta'}
            </p>
          </div>

          {isSignup && signupInfoLoading ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              Sprawdzanie zaproszenia...
            </div>
          ) : isSignup && signupNotice ? (
            <div className={`mb-4 rounded-lg border p-4 text-sm ${
              canShowSignupForm
                ? 'border-primary/30 bg-primary/5 text-gray-700 dark:text-gray-300'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            }`}>
              {signupNotice}
            </div>
          ) : null}

          {(!isSignup || !signupInfoLoading) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {canShowSignupForm && (
            <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nazwa użytkownika
              </label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setFieldErrors(prev => ({ ...prev, username: undefined })); }}
                className={`input ${fieldErrors.username ? 'border-destructive focus-visible:ring-destructive/50' : ''}`}
                required
                minLength={3}
                autoFocus
                aria-invalid={!!fieldErrors.username}
                aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined}
              />
              {fieldErrors.username && <p id="auth-username-error" className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.username}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Hasło
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: undefined })); }}
                className={`input ${fieldErrors.password ? 'border-destructive focus-visible:ring-destructive/50' : ''}`}
                required
                minLength={isSignup ? 6 : 1}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
              />
              {fieldErrors.password && <p id="auth-password-error" className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.password}</p>}
            </div>

            {isSignup && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: undefined })); }}
                    className={`input ${fieldErrors.email ? 'border-destructive focus-visible:ring-destructive/50' : ''}`}
                    required
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                  />
                  {fieldErrors.email && <p id="auth-email-error" className="mt-1 text-xs text-destructive" role="alert">{fieldErrors.email}</p>}
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={e => setAcceptTerms(e.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Akceptuję <a href="/terms.html" target="_blank" rel="noreferrer" className="text-primary hover:underline">Regulamin</a>. *
                    </span>
                  </label>

                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acceptPrivacy}
                      onChange={e => setAcceptPrivacy(e.target.checked)}
                      required
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Potwierdzam zapoznanie z <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-primary hover:underline">Polityką prywatności</a>. *
                    </span>
                  </label>

                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acceptMarketing}
                      onChange={e => setAcceptMarketing(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Chcę otrzymywać informacje marketingowe (opcjonalne).
                    </span>
                  </label>
                </div>
              </>
            )}
            </>
            )}

            {fieldErrors._schema && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {fieldErrors._schema}
              </div>
            )}

            {canShowSignupForm && (
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Ładowanie...
                </span>
              ) : (
                isSignup ? 'Zarejestruj się' : 'Zaloguj się'
              )}
            </button>
            )}
          </form>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignup(!isSignup)}
              className="text-sm text-primary hover:underline"
            >
              {isSignup ? 'Masz już konto? Zaloguj się' : 'Nie masz konta? Zarejestruj się'}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          © 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone.
          <span className="mx-2">·</span>
          <a href="/privacy.html" target="_blank" rel="noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400">Prywatność</a>
          <span className="mx-2">·</span>
          <a href="/terms.html" target="_blank" rel="noreferrer" className="hover:text-teal-600 dark:hover:text-teal-400">Regulamin</a>
        </div>
      </div>
    </div>
  );
}

function getSignupNotice(
  info: SignupInfo | null,
  token: string | null,
  error: string | null,
) {
  if (error) return error;
  if (!info) return null;
  if (info.mode === 'disabled') {
    return 'Rejestracja wyłączona.';
  }
  if (info.mode === 'invite_only' && !token) {
    return 'Aby się zarejestrować, poproś menedżera o link.';
  }
  if (info.mode === 'invite_only' && info.token_valid === false) {
    return 'Link rejestracyjny jest nieprawidłowy albo wygasł.';
  }
  if (info.mode === 'invite_only' && token) {
    return `Dołączasz do zespołu: ${info.team_name ?? 'wybrany zespół'}.`;
  }
  return null;
}
