import { useId, useState, type ChangeEvent, type FormEvent } from "react"
import { Button } from "../../shared/ui/Button/Button"
import { EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "../../shared/ui/icons/icons"
import { isWrongCredentials, useLogin } from "./login"
import styles from "./LoginForm.module.css"

/** Username and password form: logs in with them and opens the main page on success. */
export function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const loginMutation = useLogin()
  const passwordId = useId()
  const errorId = useId()

  const { error, isPending } = loginMutation
  const wrongCredentials = isWrongCredentials(error)

  const handleChange =
    (setValue: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value)
      // the error is about the values that were sent, so it goes away once they are edited
      if (error) loginMutation.reset()
    }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return

    // browsers offer to save a password only from a field that is hidden again on submit
    setIsPasswordVisible(false)
    loginMutation.mutate({ username, password })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <UserIcon className={styles.icon} />
        <input
          name="username"
          className={styles.input}
          aria-label="Логин"
          placeholder="Логин"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={255}
          required
          value={username}
          onChange={handleChange(setUsername)}
          aria-invalid={wrongCredentials || undefined}
          aria-describedby={error ? errorId : undefined}
          data-autofocus
        />
      </div>

      <div className={styles.field}>
        <LockIcon className={styles.icon} />
        <input
          id={passwordId}
          name="password"
          type={isPasswordVisible ? "text" : "password"}
          className={`${styles.input} ${styles.withToggle}`}
          aria-label="Пароль"
          placeholder="Пароль"
          autoComplete="current-password"
          required
          value={password}
          onChange={handleChange(setPassword)}
          aria-invalid={wrongCredentials || undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-label="Показать пароль"
          aria-pressed={isPasswordVisible}
          aria-controls={passwordId}
          onClick={() => setIsPasswordVisible((visible) => !visible)}
        >
          {isPasswordVisible ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {wrongCredentials
            ? "Неверный логин или пароль"
            : "Не удалось войти. Попробуй ещё раз чуть позже"}
        </p>
      )}

      {/* aria-disabled instead of disabled: a disabled button drops focus, and keyboard users
          would lose their place in the modal; repeated submits are ignored in handleSubmit */}
      <Button type="submit" className={styles.submit} aria-disabled={isPending || undefined}>
        {isPending ? "Отправляем…" : "Отправить"}
      </Button>
    </form>
  )
}
