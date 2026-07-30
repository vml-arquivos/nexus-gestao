from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "src/pages/Tarefas.tsx"


def main() -> None:
    text = PATH.read_text(encoding="utf-8")
    option = '<option value="ambos">Pontos pela lista e por cada tarefa</option>'
    if text.count(option) < 2:
        raise RuntimeError(
            'A opção de pontuação "ambos" precisa existir na criação e na edição.'
        )
    print('Pontuação preservada: lista, tarefas ou ambos.')


if __name__ == "__main__":
    main()
