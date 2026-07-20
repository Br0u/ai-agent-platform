from __future__ import annotations

from skill_core.archive import canonicalize_skill_archive
from skill_core.diff import MAX_DIFF_BYTES, diff_packages


SKILL_MD = b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"


def package_from(zip_builder, files: dict[str, bytes]):
    rooted = {f"demo-skill/{path}": content for path, content in files.items()}
    rooted["demo-skill/SKILL.md"] = SKILL_MD
    return canonicalize_skill_archive(zip_builder(rooted))


def test_marks_added_deleted_modified_and_binary_in_canonical_path_order(zip_builder) -> None:
    before = package_from(
        zip_builder,
        {
            "delete.txt": b"gone\n",
            "modify.txt": b"before\n",
            "binary.dat": b"before\x00binary",
        },
    )
    after = package_from(
        zip_builder,
        {
            "add.txt": b"new\n",
            "modify.txt": b"after\n",
            "binary.dat": b"after\x00binary",
        },
    )

    result = diff_packages(before, after)

    assert [(file.path, file.status) for file in result.files] == [
        ("add.txt", "added"),
        ("binary.dat", "binary"),
        ("delete.txt", "deleted"),
        ("modify.txt", "modified"),
    ]
    by_path = {file.path: file for file in result.files}
    assert "--- /dev/null" in by_path["add.txt"].diff
    assert "+++ b/add.txt" in by_path["add.txt"].diff
    assert "--- a/delete.txt" in by_path["delete.txt"].diff
    assert "+++ /dev/null" in by_path["delete.txt"].diff
    assert "--- a/modify.txt" in by_path["modify.txt"].diff
    assert "+++ b/modify.txt" in by_path["modify.txt"].diff
    assert by_path["binary.dat"].diff == ""
    assert result.truncated is False


def test_non_utf8_content_is_marked_binary_and_never_decoded(zip_builder) -> None:
    before = package_from(zip_builder, {"data.bin": b"\xff\xfe"})
    after = package_from(zip_builder, {"data.bin": b"\xfe\xff"})
    result = diff_packages(before, after)
    assert [(file.path, file.status, file.diff) for file in result.files] == [
        ("data.bin", "binary", "")
    ]


def test_total_utf8_diff_output_is_bounded_to_512_kib(zip_builder) -> None:
    before_text = ("before value with enough text to produce a large diff\n" * 12_000).encode()
    after_text = ("after value with enough text to produce a large diff\n" * 12_000).encode()
    before = package_from(zip_builder, {"large.txt": before_text})
    after = package_from(zip_builder, {"large.txt": after_text})

    result = diff_packages(before, after)

    assert result.truncated is True
    assert sum(len(file.diff.encode("utf-8")) for file in result.files) <= MAX_DIFF_BYTES
    assert result.files[0].diff.endswith("\n")


def test_unchanged_packages_produce_an_empty_diff(zip_builder) -> None:
    package = package_from(zip_builder, {"same.txt": b"same\n"})
    assert diff_packages(package, package).files == ()
    assert diff_packages(package, package).truncated is False
