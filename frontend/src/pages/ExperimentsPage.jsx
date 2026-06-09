import { useNavigate } from 'react-router-dom'
import ExperimentHub from '../components/Library/ExperimentHub'

export default function ExperimentsPage() {
  const navigate = useNavigate()

  return <ExperimentHub isOpen variant="page" onClose={() => navigate('/app/lab')} />
}
