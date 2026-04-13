import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvestor, type InvestorDetail } from '../api/investors';
import InvestorForm from './InvestorForm';

export default function InvestorEdit() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();

  const [investor, setInvestor] = useState<InvestorDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await getInvestor(id);
        setInvestor(data);
      } catch {
        setError('Failed to load investor.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-on-surface-variant">Loading investor…</p>
      </div>
    );
  }

  if (error || !investor) {
    return (
      <div className="p-8 flex flex-col gap-4">
        <p className="text-sm text-red-500">{error ?? 'Investor not found.'}</p>
        <button
          className="text-xs text-primary hover:underline w-fit"
          onClick={() => navigate('/investors')}
        >
          ← Back to Pipeline
        </button>
      </div>
    );
  }

  return <InvestorForm mode="edit" investor={investor} />;
}
