import { Modal } from './App'
import { Icon } from './icons'

// Draft texts. Fill in CONTROLLER and have them reviewed before launch: this is not legal advice.
const CONTROLLER = '[nome do responsável]'
const CONTACT = '[email de contacto]'
const UPDATED = '20 de outubro de 2026'

const DOCS = {
  privacy: {
    title: 'Política de Privacidade',
    sections: [
      ['Quem trata os teus dados', `${CONTROLLER} é o responsável pelo tratamento dos dados da faísca. Para qualquer pedido sobre os teus dados: ${CONTACT}.`],
      ['Que dados guardamos', 'Username e password (encriptada); nome, data de nascimento, género, quem procuras, altura, profissão, bio, interesses e fotos; a tua localização arredondada a ~1 km, só se a partilhares; os teus gostos, matches, mensagens, bloqueios e denúncias.'],
      ['Dados sensíveis', 'Quem procuras (homens, mulheres ou todos) pode revelar a tua orientação sexual. Só tratamos este dado com o teu consentimento explícito, dado ao criar a conta, e apenas para te mostrar perfis compatíveis.'],
      ['Para que usamos', 'Para criar a tua conta, mostrar-te perfis compatíveis (o algoritmo usa interesses, idade, altura, distância e gostos), permitir matches e conversas, e manter a comunidade segura (bloqueios e denúncias). Não vendemos dados nem mostramos publicidade.'],
      ['O que os outros veem', 'O teu perfil (nome, idade, fotos, profissão, altura, bio, interesses) e uma distância aproximada (ex.: “a menos de 10 km”). Nunca a tua data de nascimento, a tua posição ou o teu username. As mensagens só são visíveis para ti e para o teu match.'],
      ['Menores', 'É preciso ter pelo menos 17 anos. Contas com menos de 18 anos só veem e são vistas por pessoas até aos 19 anos.'],
      ['Onde ficam os dados', 'Base de dados e autenticação: Supabase. Fotos: Microsoft Azure (Alemanha). Site: Vercel. Estes fornecedores tratam os dados por nossa conta.'],
      ['Durante quanto tempo', 'Enquanto a tua conta existir. Ao apagares a conta, perfil, fotos, matches e mensagens são apagados de imediato.'],
      ['Os teus direitos', `Podes aceder, corrigir e apagar os teus dados (em Perfil → Apagar conta), retirar o consentimento, e pedir a portabilidade ou opor-te ao tratamento através de ${CONTACT}. Podes também apresentar queixa à CNPD (www.cnpd.pt).`],
    ],
  },
  terms: {
    title: 'Termos de Utilização',
    sections: [
      ['Quem pode usar', 'Tens de ter pelo menos 17 anos e dar dados verdadeiros, incluindo a data de nascimento. Uma conta por pessoa.'],
      ['Conduta', 'É proibido assédio, ameaças, discurso de ódio, conteúdo sexual explícito, spam, burlas, fazer-se passar por outra pessoa e usar fotos de terceiros. Contactar menores com intenção sexual é crime.'],
      ['Fotos e conteúdo', 'Só podes carregar fotos tuas ou que tens direito a usar. Continuas dono do teu conteúdo; dás-nos permissão para o mostrar dentro da app.'],
      ['Segurança', 'Usa Bloquear e Denunciar em qualquer conversa. Podemos suspender ou apagar contas que violem estes termos.'],
      ['Encontros', 'Os encontros são da tua responsabilidade. Encontra-te em locais públicos e avisa alguém de confiança.'],
      ['O serviço', 'A faísca é um projeto em fase de testes, fornecido tal como está, e pode mudar ou parar.'],
      ['Contacto', `${CONTROLLER}, ${CONTACT}.`],
    ],
  },
}

export function LegalModal({ doc, onClose }) {
  const { title, sections } = DOCS[doc]
  return (
    <Modal className="filter-modal legal-modal" onClose={onClose}>
      {(close) => <>
        <div className="modal-heading">
          <div><span className="kicker">ATUALIZADO A {UPDATED.toUpperCase()}</span><div className="modal-title">{title}</div></div>
          <button className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button>
        </div>
        {sections.map(([h, body]) => <section key={h}><h3>{h}</h3><p>{body}</p></section>)}
      </>}
    </Modal>
  )
}
