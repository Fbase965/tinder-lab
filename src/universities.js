// Universities and schools offered in the profile form. Grouped for <optgroup>; "Outra" allows free text.
export const UNIVERSITIES = [
  ['Universidade do Porto', [
    'FEUP — Engenharia', 'FCUP — Ciências', 'FEP — Economia', 'FLUP — Letras', 'FMUP — Medicina', 'ICBAS',
    'FADEUP — Desporto', 'FDUP — Direito', 'FBAUP — Belas Artes', 'FAUP — Arquitetura', 'FFUP — Farmácia',
    'FPCEUP — Psicologia e Educação', 'FMDUP — Medicina Dentária', 'FCNAUP — Nutrição',
  ]],
  ['Politécnico do Porto', [
    'ISEP — Engenharia', 'ISCAP — Contabilidade e Administração', 'ESMAD — Media Artes e Design', 'ESE — Educação',
    'ESMAE — Música e Artes do Espetáculo', 'ESS — Saúde', 'ESHT — Hotelaria e Turismo', 'ESTG — Tecnologia e Gestão',
  ]],
  ['Outras no Porto', [
    'Universidade Católica (Porto)', 'Universidade Lusófona (Porto)', 'Universidade Portucalense', 'Universidade Fernando Pessoa',
    'Universidade da Maia (ISMAI)', 'Universidade Lusíada (Porto)', 'ESEP — Enfermagem do Porto', 'ESAD — Artes e Design (Matosinhos)',
    'ISAG — European Business School', 'IPAM Porto', 'CESPU — IUCS', 'Escola Superior Artística do Porto',
  ]],
  ['Fora do Porto', ['Universidade do Minho', 'UTAD', 'Universidade de Aveiro', 'Universidade de Coimbra', 'Universidade de Lisboa']],
]
export const OTHER = 'Outra'
export const isListed = (u) => UNIVERSITIES.some(([, list]) => list.includes(u))
