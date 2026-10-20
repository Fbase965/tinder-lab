import { Modal } from './App'
import { Icon } from './icons'

// Draft texts in the name of the website. Before a public launch, add a real contact (GDPR art. 13)
// and have them reviewed: this is not legal advice.
const SITE = 'faísca (faiscauni.vercel.app)'
const CONTACT = 'a equipa da faísca, através da própria aplicação'
const UPDATED = '20 de outubro de 2026'

const DOCS = {
  privacy: {
    title: 'Política de Privacidade',
    sections: [
      ['Responsável pelo tratamento', `Os dados pessoais dos utilizadores são tratados pela ${SITE}. Qualquer pedido relativo a dados pessoais pode ser dirigido a ${CONTACT}.`],
      ['Dados recolhidos', 'A faísca guarda o username e a password (encriptada); o nome, a data de nascimento, o género, quem o utilizador procura, a altura, a profissão, a bio, os interesses e as fotos; a localização arredondada a cerca de 1 km, apenas se o utilizador a partilhar; e os gostos, matches, mensagens, bloqueios e denúncias.'],
      ['Dados sensíveis', 'A indicação de quem o utilizador procura (homens, mulheres ou todos) pode revelar a sua orientação sexual. A faísca só trata este dado com o consentimento explícito dado na criação da conta, e apenas para mostrar perfis compatíveis.'],
      ['Finalidades', 'Os dados são usados para criar e manter a conta, sugerir perfis compatíveis (o algoritmo considera interesses, idade, altura, distância e gostos), permitir matches e conversas, e manter a comunidade segura através de bloqueios e denúncias. A faísca não vende dados nem mostra publicidade.'],
      ['O que os outros utilizadores veem', 'O perfil (nome, idade, fotos, profissão, altura, bio e interesses) e uma distância aproximada, como “a menos de 10 km”. A data de nascimento, a posição exata e o username nunca são mostrados. As mensagens só são visíveis para os dois participantes da conversa.'],
      ['Idade mínima', 'A faísca é exclusiva para maiores de 18 anos.'],
      ['Subcontratantes e localização dos dados', 'Base de dados e autenticação: Supabase. Fotos: Microsoft Azure (Alemanha). Alojamento do site: Vercel. Estes fornecedores tratam os dados por conta da faísca.'],
      ['Conservação', 'Os dados são conservados enquanto a conta existir. Quando o utilizador apaga a conta, o perfil, as fotos, os matches e as mensagens são apagados de imediato.'],
      ['Direitos dos utilizadores', `Os utilizadores podem aceder, corrigir e apagar os seus dados (em Perfil → Apagar conta), retirar o consentimento, pedir a portabilidade ou opor-se ao tratamento, contactando ${CONTACT}. Têm ainda o direito de apresentar queixa à CNPD (www.cnpd.pt).`],
    ],
  },
  terms: {
    title: 'Termos de Utilização',
    sections: [
      ['Aceitação', `Ao criar uma conta, o utilizador aceita estes termos e a Política de Privacidade da ${SITE}.`],
      ['Quem pode usar', 'O utilizador tem de ter pelo menos 18 anos e fornecer dados verdadeiros, incluindo a data de nascimento. É permitida apenas uma conta por pessoa.'],
      ['Conduta', 'É proibido assediar, ameaçar, publicar discurso de ódio ou conteúdo sexual explícito, enviar spam, burlar, fazer-se passar por outra pessoa ou usar fotos de terceiros. É proibido criar conta com menos de 18 anos.'],
      ['Fotos e conteúdo', 'O utilizador só pode carregar fotos suas ou que tenha direito a usar. O conteúdo continua a pertencer ao utilizador, que autoriza a faísca a mostrá-lo dentro da aplicação.'],
      ['Segurança e moderação', 'Qualquer conversa pode ser bloqueada ou denunciada. A faísca pode suspender ou apagar contas que violem estes termos.'],
      ['Encontros', 'Os encontros entre utilizadores são da responsabilidade de cada um. A faísca recomenda encontros em locais públicos e avisar alguém de confiança.'],
      ['Serviço', 'A faísca é um projeto em fase de testes, fornecido tal como está, e pode ser alterado ou descontinuado.'],
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
