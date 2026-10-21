// Email domains that count as a university address (green "pessoa real" badge). Subdomains count too
// (student@fe.up.pt, x@isep.ipp.pt). Used by api/email.js, which is the check that matters.
export const UNIVERSITY_DOMAINS = [
  'up.pt', 'ipp.pt', 'ucp.pt', 'ulusofona.pt', 'ulp.pt', 'upt.pt', 'ufp.edu.pt', 'ufp.pt', 'ismai.pt', 'umaia.pt',
  'lusiada.pt', 'ulusiada.pt', 'esenf.pt', 'esad.pt', 'isag.pt', 'ipam.pt', 'cespu.pt', 'esap.pt',
  'uminho.pt', 'utad.pt', 'ua.pt', 'uc.pt', 'ulisboa.pt', 'unl.pt', 'iscte-iul.pt', 'ipl.pt', 'ipc.pt',
]
export const isUniversityEmail = (email) => {
  const domain = email.trim().toLowerCase().split('@')[1] ?? ''
  return UNIVERSITY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}
