import { Modal } from './App'
import { Icon } from './icons'

// Draft texts in the name of the website. Before a public launch, add a real contact (GDPR art. 13)
// and have them reviewed: this is not legal advice.
const SITE = 'faísca (faiscauni.vercel.app)'
const CONTACT = 'a equipa da faísca, através da própria aplicação'
const UPDATED = '21 de outubro de 2026'

const DOCS = {
  privacy: {
    title: 'Política de Privacidade',
    sections: [
      ['Responsável pelo tratamento', `Os dados pessoais dos utilizadores são tratados pela ${SITE}. Qualquer pedido relativo a dados pessoais pode ser dirigido a ${CONTACT}.`],
      ['Dados recolhidos', 'A faísca guarda o username e a password (encriptada); o nome, a data de nascimento, o género, quem o utilizador procura, a altura, a universidade, a bio, os interesses e as fotos; a localização arredondada a cerca de 1 km, apenas se o utilizador a partilhar; os gostos, matches, mensagens, bloqueios e denúncias; quem abriu o perfil completo de quem (visitas, guardadas 30 dias); o número de telemóvel, apenas se o utilizador o verificar por SMS; e, para subscritores, o estado da subscrição faísca+.'],
      ['Visitas e gostos (faísca+)', 'Quando um utilizador abre o perfil completo de outra pessoa, essa visita fica registada. Utilizadores com faísca+ podem ver quem visitou o seu perfil nos últimos 30 dias e quem lhes deu gosto. Pessoas bloqueadas nunca aparecem nestas listas.'],
      ['Dados sensíveis', 'A indicação de quem o utilizador procura (homens, mulheres ou todos) pode revelar a sua orientação sexual. A faísca só trata este dado com o consentimento explícito dado na criação da conta, e apenas para mostrar perfis compatíveis.'],
      ['Finalidades', 'Os dados são usados para criar e manter a conta, sugerir perfis compatíveis (o algoritmo considera interesses, idade, altura, distância e gostos), permitir matches e conversas, e manter a comunidade segura através de bloqueios e denúncias. A faísca não vende dados nem mostra publicidade.'],
      ['O que os outros utilizadores veem', 'O perfil (nome, idade, fotos, universidade, altura, bio e interesses), os selos (faísca+ e pessoa real) e uma distância aproximada, como “a menos de 10 km”. A data de nascimento, o número de telemóvel e a posição exata nunca são mostrados; o username só é visível para os matches. As mensagens só são visíveis para os dois participantes da conversa.'],
      ['Idade mínima', 'A faísca é exclusiva para maiores de 18 anos.'],
      ['Subcontratantes e localização dos dados', 'Base de dados e autenticação: Supabase. Fotos: Microsoft Azure (Alemanha). Alojamento do site: Vercel. Pagamentos: Stripe (a faísca nunca vê os dados do cartão). Notificações: serviço de push do browser. SMS de verificação: o fornecedor de SMS configurado no Supabase. Estes fornecedores tratam os dados por conta da faísca.'],
      ['Segurança e autoridades', 'Para manter a comunidade segura, a equipa da faísca analisa as denúncias e os perfis denunciados. As mensagens não são lidas pela equipa, exceto quando isso for necessário para investigar uma denúncia grave ou quando a lei o exigir. A faísca entrega dados às autoridades judiciárias e policiais quando está legalmente obrigada ou quando há risco para a vida ou a integridade de alguém (RGPD, art. 6.º, n.º 1, alíneas c) e d)).'],
      ['Conservação', 'Os dados são conservados enquanto a conta existir. Quando o utilizador apaga a conta, o perfil, as fotos, os matches e as mensagens são apagados de imediato, salvo os dados que tenham de ser preservados por pedido das autoridades ou por uma investigação em curso.'],
      ['Direitos dos utilizadores', `Os utilizadores podem aceder, corrigir e apagar os seus dados (em Perfil → Apagar conta), retirar o consentimento, pedir a portabilidade ou opor-se ao tratamento, contactando ${CONTACT}. Têm ainda o direito de apresentar queixa à CNPD (www.cnpd.pt).`],
    ],
  },
  terms: {
    title: 'Termos de Utilização',
    sections: [
      ['Aceitação', `Ao criar uma conta, o utilizador aceita estes termos e a Política de Privacidade da ${SITE}. Quem não concorda não pode usar a faísca.`],
      ['Quem pode usar', 'Só pode usar a faísca quem tem pelo menos 18 anos, fornece dados verdadeiros (incluindo nome, fotos e data de nascimento) e não foi condenado por crime contra a liberdade ou autodeterminação sexual, nem por crime violento contra pessoas. É permitida apenas uma conta por pessoa. Quem tiver sido banido não pode criar uma nova conta.'],
      ['Tolerância zero com menores', 'É proibido criar conta com menos de 18 anos, contactar ou tentar contactar menores, e partilhar qualquer conteúdo que envolva menores. Estas contas são apagadas de imediato e os casos suspeitos são comunicados às autoridades.'],
      ['Proibido dinheiro e trocas', 'A faísca serve para conhecer pessoas, não para negócios. É proibido pedir, oferecer ou combinar dinheiro, presentes, pagamentos, serviços sexuais ou qualquer troca material através da faísca. Isto inclui encontros pagos, "sugar dating", pedidos de transferências, MB WAY, cartões-oferta, criptomoedas, investimentos e empréstimos. Também é proibido vender ou promover produtos, serviços, drogas ou armas, e recrutar para outras plataformas.'],
      ['Contas falsas e identidade', 'Cada conta tem de pertencer a uma pessoa real e mostrar a própria pessoa. É proibido fingir ser outra pessoa, usar fotos de terceiros ou geradas por inteligência artificial para enganar, ou criar contas para burlar, fazer spam ou recolher dados de outros utilizadores.'],
      ['Conduta proibida', 'É proibido assediar, ameaçar, perseguir, chantagear ou intimidar; publicar discurso de ódio ou incitar à violência; enviar conteúdo sexual explícito sem o pedido e consentimento claro da outra pessoa; partilhar fotos ou conversas íntimas de outra pessoa sem autorização; pedir fotos íntimas em troca de algo ou ameaçar divulgá-las; e publicar dados pessoais de terceiros, como morada, telefone ou local de trabalho.'],
      ['Fotos e conteúdo', 'O utilizador só pode carregar fotos suas, em que apareça a própria pessoa, ou que tenha direito a usar. Não são permitidas fotos com nudez, menores sozinhos, armas, dados pessoais visíveis ou contactos. O conteúdo continua a pertencer ao utilizador, que autoriza a faísca a mostrá-lo dentro da aplicação.'],
      ['Denúncias e moderação', 'Qualquer pessoa pode ser bloqueada ou denunciada a partir da conversa. As denúncias são analisadas pela equipa da faísca. Quem violar estes termos pode ver o conteúdo removido, a conta suspensa ou banida de forma permanente, sem aviso prévio nos casos graves. A faísca pode recusar novas contas de quem tenha sido banido. Denúncias falsas feitas de propósito também violam estes termos.'],
      ['Colaboração com as autoridades', 'A faísca colabora com as autoridades judiciárias e policiais. Quando a lei o exigir, ou quando houver risco para a vida ou a integridade de alguém, a faísca pode preservar e entregar às autoridades os dados da conta, as denúncias e outros dados existentes que ajudem a investigar um crime. Uma conta apagada pode ter dados preservados se já houver uma investigação ou um pedido das autoridades.'],
      ['Os selos', 'O selo azul indica apenas que a pessoa tem a subscrição faísca+ ativa. O selo verde de pessoa real indica apenas que a conta confirmou um número de telemóvel por SMS. Nenhum dos dois confirma a identidade, a idade nem as intenções de ninguém. Tem sempre os mesmos cuidados com todas as pessoas.'],
      ['Conselhos de segurança', 'Nunca envies dinheiro nem dados bancários, códigos de verificação ou passwords a alguém que conheceste na faísca, mesmo que conte uma história urgente ou comovente. Desconfia de quem foge para outra app muito cedo, evita videochamadas ou fala de investimentos. No primeiro encontro, escolhe um local público, avisa alguém de confiança, usa o teu próprio transporte e vai-te embora se te sentires desconfortável. Em perigo, liga 112. Para apoio a vítimas, a APAV atende no 116 006.'],
      ['Encontros', 'Os encontros entre utilizadores são da responsabilidade de cada um. A faísca não verifica antecedentes criminais nem a identidade dos utilizadores, e não controla o que acontece fora da aplicação.'],
      ['faísca+', 'A subscrição faísca+ é paga mensalmente através da Stripe e renova-se automaticamente até ser cancelada, o que pode ser feito a qualquer momento em Perfil → faísca+ → Gerir subscrição; o acesso mantém-se até ao fim do período pago. Ao subscrever, o utilizador pede o início imediato do serviço e reconhece que perde o direito de livre resolução de 14 dias a partir desse momento. Uma conta banida por violar estes termos perde o faísca+ sem reembolso do período em curso. A faísca pode também oferecer faísca+ por tempo limitado.'],
      ['Serviço e alterações', 'A faísca é um projeto em fase de testes, fornecido tal como está, e pode ser alterado ou descontinuado. Estes termos podem ser atualizados; a data no topo indica a versão em vigor, e continuar a usar a faísca depois de uma alteração significa aceitar a nova versão.'],
      ['Lei aplicável', 'Estes termos regem-se pela lei portuguesa. Nada nestes termos limita os direitos que a lei garante aos consumidores.'],
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
