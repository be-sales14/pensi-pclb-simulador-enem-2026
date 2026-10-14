import { Cabecalho } from '@/components/Basicos';
import { FormularioSimulado } from '@/components/FormularioSimulado';

export default function Inicio() {
  return (
    <>
      <Cabecalho />
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Simulado ENEM com questões reais</h1>
          <p className="text-lg text-texto">
            Questões das provas oficiais de 2019 a 2025, misturadas na mesma proporção da prova: quantas de cada
            disciplina e, em Matemática, de cada assunto.
          </p>
          <ul className="flex flex-col gap-2 text-texto">
            <li>Cada questão aparece como no caderno oficial, com as figuras.</li>
            <li>Faça na tela e veja a nota na hora, ou baixe o PDF e faça no papel.</li>
            <li>O gabarito só aparece depois que você entrega.</li>
          </ul>
        </section>
        <section aria-label="Montar simulado" className="rounded-2xl border border-linha p-5 sm:p-7">
          <FormularioSimulado />
        </section>
      </main>
    </>
  );
}
