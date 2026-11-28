import { useAuth } from '../context/AuthContext.jsx';
import { categoryFor } from './businessCategories.js';

/** Category labels for the signed-in business, used by interest fields. */
export function useBusinessCategory() {
  const { tenant } = useAuth();
  return categoryFor(tenant?.industry);
}

export default useBusinessCategory;
