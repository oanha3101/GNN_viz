import { useNavigate } from 'react-router-dom'
import AuthScreen from '../components/Auth/AuthScreen'
import useAuthStore from '../store/authStore'
import { getDefaultPathForUser } from '../utils/appRoutes'

export default function AuthPage({ mode }) {
  const navigate = useNavigate()

  return (
    <AuthScreen
      mode={mode}
      onModeChange={(nextMode) => navigate(nextMode === 'register' ? '/register' : '/login')}
      onAuthenticated={(nextUser) => {
        const user = nextUser || useAuthStore.getState().user
        navigate(getDefaultPathForUser(user), { replace: true })
      }}
    />
  )
}
