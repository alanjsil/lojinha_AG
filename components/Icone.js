import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faCashRegister,
  faChartColumn,
  faCircleArrowDown,
  faCircleArrowUp,
  faCircleInfo,
  faDeleteLeft,
  faStore,
  faTriangleExclamation,
  faVault,
} from "@fortawesome/free-solid-svg-icons";

config.autoAddCss = false; // o CSS já vem do import acima (evita piscar no Next)

const ICONES = {
  vault: faVault,
  info: faCircleInfo,
  alerta: faTriangleExclamation,
  apagar: faDeleteLeft,
  loja: faStore,
  estoque: faBoxesStacked,
  relatorios: faChartColumn,
  entrada: faCircleArrowDown,
  saida: faCircleArrowUp,
  caixa: faCashRegister,
};

export default function Icone({ nome, className }) {
  return <FontAwesomeIcon icon={ICONES[nome]} className={className} fixedWidth aria-hidden="true" />;
}
