import { Modal } from "./Modal";
import { openExternal } from "../lib/links";

type Props = {
  onClose: () => void;
  topicExample: string;
};

function extLink(href: string): React.ReactElement {
  return (
    <a
      href={href}
      className="ext-link"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      <code>{href}</code>
    </a>
  );
}

export function WatcherHelpModal({ onClose, topicExample }: Props) {
  return (
    <Modal title="Como configurar o ntfy" onClose={onClose} zIndex={110}>
      <section className="modal-section">
        <p>
          <strong>ntfy</strong> é um serviço gratuito de notificações por
          push. O Ragmarket envia uma mensagem para um <em>tópico</em> e
          o app do ntfy no seu celular recebe e mostra como notificação
          — sem cadastro, sem chave de API.
        </p>
        <ol className="modal-numbered">
          <li>
            Instale o app <strong>ntfy</strong> no celular:
            <ul>
              <li>
                Android: na Play Store ou em {extLink("https://ntfy.sh/app")}
              </li>
              <li>iOS: na App Store, busque por “ntfy”</li>
            </ul>
          </li>
          <li>
            No app, toque em <strong>“Subscribe to topic”</strong> e
            escolha um <strong>nome único</strong>. Qualquer pessoa que
            souber o nome recebe as suas notificações, então trate como
            uma senha curta (ex: <code>{topicExample}</code>) — evite
            nomes óbvios.
          </li>
          <li>
            Cole o mesmo nome no campo <strong>“Tópico ntfy”</strong>{" "}
            aqui no Ragmarket, marque o canal Push e clique{" "}
            <strong>Testar</strong> para confirmar que chegou no
            celular.
          </li>
        </ol>
        <p className="muted modal-hint">
          O servidor padrão é o público <code>ntfy.sh</code>. Mais
          informações em {extLink("https://docs.ntfy.sh")}.
        </p>
      </section>
    </Modal>
  );
}
