from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require_markers(relative_path: str, markers: list[str]) -> None:
    path = ROOT / relative_path
    content = path.read_text(encoding="utf-8")
    missing = [marker for marker in markers if marker not in content]
    if missing:
        missing_list = "\n  - ".join(missing)
        raise RuntimeError(
            f"{relative_path} não contém a implementação final esperada:\n"
            f"  - {missing_list}"
        )


def main() -> None:
    # Este script era um patch textual não idempotente executado durante o
    # Docker build. A implementação já faz parte do código-fonte; agora o
    # passo apenas valida o contrato e nunca modifica arquivos no build.
    require_markers(
        "src/pages/Tarefas.tsx",
        [
            "useMemo, useRef, useState",
            "const [destravaSelectOpen, setDestravaSelectOpen]",
            'className="destrava-search-select"',
            "pageSize = 250",
            "page,\n        })",
        ],
    )
    require_markers(
        "src/lib/api.ts",
        [
            "page?: number",
            "page: String(params?.page || 1)",
            "has_more?: boolean",
        ],
    )
    require_markers(
        "backend/src/routes/integracoes.ts",
        [
            "const offset = (page - 1) * limit",
            "LIMIT $4 OFFSET $5",
            "has_more: offset + empresas.length < total",
        ],
    )
    require_markers(
        "src/app-styles.css",
        [
            ".destrava-search-select {",
            ".destrava-search-select__panel {",
            ".destrava-search-select__option {",
        ],
    )
    print("Seleção PJ/PF validada: código final presente e build idempotente.")


if __name__ == "__main__":
    main()
