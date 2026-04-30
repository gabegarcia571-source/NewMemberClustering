from __future__ import annotations

import json
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


EXCEL_PATH = Path(r"C:\Users\12022\Downloads\Rosslyn Networking Survey Results - Analyst.xlsx")
SHEET_NAME = "Analyst"
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
FRONTEND_DATA_PATH = Path(__file__).resolve().parents[1] / "frontend" / "public" / "data" / "network-map.json"
K_RANGE = (5, 20)
MIN_CLUSTER_SIZE = 5
RANDOM_SEED = 42
K_OVERRIDE: int | None = None
WEAK_SILHOUETTE_THRESHOLD = 0.15
NEAR_BEST_SILHOUETTE_DELTA = 0.01
WEAK_REGIME_MAX_CLUSTER_SIZE = 45
EXPECTED_ROW_COUNT = 189
CLUSTER_ORBIT_RADIUS = 57.6
LOCAL_CLUSTER_SCALE = 14.0
JITTER_RANGE = 1.2

ACTIVITY_COLUMNS = [
    "Hiking, Biking Running",
    "Gaming",
    "Reading and Discussing Books",
    "Grabbing a coffee",
    "Going to a happy hour",
    "Going to the movies",
    "Going out to watch a game",
    "Participating in an adult sports league",
    "Having an activities night",
]

COLUMN_MAP = {
    "office": "Office",
    "first_name": "First (Preferred)",
    "last_name": "Last",
    "email": "Email",
    "phone": "Phone",
    "instagram_username": "Instagram Username",
    "about_me": "Write about you!",
}

PERSONA_PRIORITY = [
    "Social",
    "Collaborative",
    "Community-Oriented",
    "Entrepreneurial",
    "Adventurous",
    "Creative",
    "Analytical",
    "Technical",
]

PERSONA_KEYWORDS = {
    "Social": ["people", "connect", "network", "meetup", "events", "social", "friends"],
    "Collaborative": ["team", "collaborate", "together", "partner", "support", "cross-functional"],
    "Community-Oriented": ["volunteer", "give back", "nonprofit", "serve", "local", "neighbors", "community"],
    "Entrepreneurial": ["startup", "founder", "venture", "launch", "scale", "own", "build a business"],
    "Adventurous": ["explore", "travel", "hike", "adventure", "new", "challenge", "outside", "outdoors"],
    "Creative": ["design", "art", "creative", "write", "imagine", "visual", "storytelling"],
    "Analytical": ["analyze", "data", "research", "insights", "metrics", "evaluate", "assess"],
    "Technical": ["code", "engineer", "software", "system", "build", "develop", "technical", "api"],
}

ACTIVITY_SHORT = {
    "Hiking, Biking Running": "Outdoors",
    "Gaming": "Gaming",
    "Reading and Discussing Books": "Books",
    "Grabbing a coffee": "Coffee",
    "Going to a happy hour": "Happy Hour",
    "Going to the movies": "Movies",
    "Going out to watch a game": "Sports Watching",
    "Participating in an adult sports league": "Sports League",
    "Having an activities night": "Activity Nights",
}


@dataclass
class PersonaResult:
    persona_tag: str
    persona_confidence: float
    runner_up_persona: str | None


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def whole_word_count(text: str, phrase: str) -> int:
    pattern = r"\b" + re.escape(phrase.lower()) + r"\b"
    return len(re.findall(pattern, text.lower()))


def fibonacci_sphere_points(count: int, radius: float) -> list[np.ndarray]:
    points: list[np.ndarray] = []
    golden_angle = math.pi * (3 - math.sqrt(5))
    if count == 1:
        return [np.array([0.0, 0.0, 0.0])]
    for index in range(count):
        y = 1 - (index / float(count - 1)) * 2
        radial = math.sqrt(max(0.0, 1 - y * y))
        theta = golden_angle * index
        x = math.cos(theta) * radial
        z = math.sin(theta) * radial
        points.append(np.array([x, y, z]) * radius)
    return points


def load_dataframe() -> pd.DataFrame:
    df = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_NAME, header=1)
    expected_columns = [*COLUMN_MAP.values(), *ACTIVITY_COLUMNS]
    missing = [col for col in expected_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Workbook is missing expected columns: {missing}")

    df = df[expected_columns].copy()

    for col in ACTIVITY_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).clip(lower=0, upper=3).astype(int)

    if len(df) != EXPECTED_ROW_COUNT:
        raise ValueError(f"Expected {EXPECTED_ROW_COUNT} analysts, found {len(df)}")

    if df[ACTIVITY_COLUMNS].isna().any().any():
        raise ValueError("NaN values remain in activity scores after blank-to-zero substitution.")

    invalid_values = set(int(v) for v in pd.unique(df[ACTIVITY_COLUMNS].to_numpy().ravel())) - {0, 1, 2, 3}
    if invalid_values:
        raise ValueError(f"Invalid activity score values found: {sorted(invalid_values)}")

    full_names = (df[COLUMN_MAP["first_name"]].fillna("").astype(str).str.strip() + " " + df[COLUMN_MAP["last_name"]].fillna("").astype(str).str.strip()).str.strip()
    duplicate_names = full_names[full_names.duplicated()].unique().tolist()
    if duplicate_names:
        logging.warning("Duplicate names found: %s", duplicate_names)

    return df


def top_activities(score_map: dict[str, int]) -> list[str]:
    ranked = sorted(score_map.items(), key=lambda item: (-item[1], ACTIVITY_COLUMNS.index(item[0])))
    positives = [name for name, score in ranked if score > 0]
    return positives[:3]


def activity_persona_scores(score_map: dict[str, int]) -> dict[str, float]:
    scores = {persona: 0.0 for persona in PERSONA_PRIORITY}
    scores["Adventurous"] += score_map["Hiking, Biking Running"] * 1.3 + score_map["Participating in an adult sports league"] * 1.2
    scores["Social"] += score_map["Going to a happy hour"] * 1.3 + score_map["Going out to watch a game"] * 1.0 + score_map["Having an activities night"] * 1.1
    scores["Collaborative"] += score_map["Grabbing a coffee"] * 1.0 + score_map["Having an activities night"] * 0.8 + score_map["Going to a happy hour"] * 0.5
    scores["Analytical"] += score_map["Reading and Discussing Books"] * 1.4 + score_map["Grabbing a coffee"] * 0.5
    scores["Technical"] += score_map["Gaming"] * 1.4 + score_map["Going to the movies"] * 0.4
    scores["Creative"] += score_map["Going to the movies"] * 1.0 + score_map["Reading and Discussing Books"] * 0.6 + score_map["Having an activities night"] * 0.5
    scores["Community-Oriented"] += score_map["Grabbing a coffee"] * 0.8 + score_map["Having an activities night"] * 0.7 + score_map["Participating in an adult sports league"] * 0.4
    scores["Entrepreneurial"] += score_map["Grabbing a coffee"] * 0.5 + score_map["Going to a happy hour"] * 0.6 + score_map["Having an activities night"] * 0.4
    return scores


def persona_from_profile(text: str | None, score_map: dict[str, int], top_activity_list: list[str]) -> PersonaResult:
    normalized = str(text).strip().lower() if text is not None and str(text).strip() else ""
    scores: dict[str, int] = {}
    for persona, keywords in PERSONA_KEYWORDS.items():
        scores[persona] = sum(whole_word_count(normalized, keyword) for keyword in keywords)

    weighted_scores = {persona: float(score) * 2.0 for persona, score in scores.items()}
    for persona, activity_score in activity_persona_scores(score_map).items():
        weighted_scores[persona] += activity_score

    for index, activity in enumerate(top_activity_list):
        bonus = 0.6 if index == 0 else 0.35 if index == 1 else 0.2
        if activity == "Hiking, Biking Running":
            weighted_scores["Adventurous"] += bonus
        elif activity == "Participating in an adult sports league":
            weighted_scores["Adventurous"] += bonus
            weighted_scores["Collaborative"] += bonus * 0.5
        elif activity == "Going to a happy hour":
            weighted_scores["Social"] += bonus
            weighted_scores["Entrepreneurial"] += bonus * 0.4
        elif activity == "Going out to watch a game":
            weighted_scores["Social"] += bonus
        elif activity == "Gaming":
            weighted_scores["Technical"] += bonus
        elif activity == "Reading and Discussing Books":
            weighted_scores["Analytical"] += bonus
            weighted_scores["Creative"] += bonus * 0.4
        elif activity == "Grabbing a coffee":
            weighted_scores["Collaborative"] += bonus
            weighted_scores["Community-Oriented"] += bonus * 0.3
        elif activity == "Going to the movies":
            weighted_scores["Creative"] += bonus
        elif activity == "Having an activities night":
            weighted_scores["Social"] += bonus * 0.8
            weighted_scores["Collaborative"] += bonus * 0.6

    ordered = sorted(weighted_scores.items(), key=lambda item: (-item[1], PERSONA_PRIORITY.index(item[0])))
    winner, winner_score = ordered[0]
    runner_up_score = ordered[1][1] if len(ordered) > 1 else 0.0
    runner_up = ordered[1][0] if len(ordered) > 1 and ordered[1][1] > 0 and ordered[1][1] != winner_score else None
    if winner_score <= 0:
        confidence = 0.0
    else:
        confidence = round(winner_score / (winner_score + runner_up_score), 4) if runner_up_score > 0 else 1.0
    return PersonaResult(winner, confidence, runner_up)


def discover_clusters(features: np.ndarray) -> tuple[np.ndarray, dict[str, Any], list[dict[str, Any]]]:
    candidates: list[dict[str, Any]] = []
    best_overall: dict[str, Any] | None = None

    for k in range(K_RANGE[0], K_RANGE[1] + 1):
        model = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=20)
        labels = model.fit_predict(features)
        silhouette = float(silhouette_score(features, labels))
        sizes = np.bincount(labels, minlength=k).tolist()
        candidate = {
            "k": k,
            "silhouetteScore": round(silhouette, 6),
            "clusterSizes": sizes,
            "minClusterSize": int(min(sizes)),
            "maxClusterSize": int(max(sizes)),
            "passedMinSize": bool(min(sizes) >= MIN_CLUSTER_SIZE),
            "labels": labels,
            "model": model,
        }
        candidates.append(candidate)
        if best_overall is None or candidate["silhouetteScore"] > best_overall["silhouetteScore"]:
            best_overall = candidate

    assert best_overall is not None

    if K_OVERRIDE is not None:
        selected = next((candidate for candidate in candidates if candidate["k"] == K_OVERRIDE), None)
        if selected is None:
            raise ValueError(f"K_OVERRIDE={K_OVERRIDE} is outside configured range {K_RANGE}")
        reasoning = f"Manual override selected k={K_OVERRIDE}."
        selected["selectionReasoning"] = reasoning
        return selected["labels"], {
            "testedK": strip_candidate_metadata(candidates),
            "selectedK": selected["k"],
            "selectionReasoning": reasoning,
        }, candidates

    passing = [candidate for candidate in candidates if candidate["passedMinSize"]]
    if passing:
        top_silhouette = max(candidate["silhouetteScore"] for candidate in passing)
        close = [candidate for candidate in passing if top_silhouette - candidate["silhouetteScore"] <= NEAR_BEST_SILHOUETTE_DELTA]
        if best_overall["silhouetteScore"] < WEAK_SILHOUETTE_THRESHOLD:
            balanced_close = [candidate for candidate in close if candidate["maxClusterSize"] <= WEAK_REGIME_MAX_CLUSTER_SIZE]
            pool = balanced_close or close
            selected = sorted(pool, key=lambda item: (item["k"], item["maxClusterSize"], -item["silhouetteScore"]))[0]
            reasoning = (
                f"Weak silhouette regime detected ({best_overall['silhouetteScore']:.4f} below "
                f"{WEAK_SILHOUETTE_THRESHOLD:.2f}). The selector preferred a smaller readable pod count among "
                f"near-best candidates, choosing k={selected['k']} while keeping the largest cluster at "
                f"{selected['maxClusterSize']} members."
            )
        else:
            selected = sorted(close, key=lambda item: (item["maxClusterSize"], item["k"]))[0]
            reasoning = (
                f"k={selected['k']} selected from candidates meeting the minimum cluster size threshold of "
                f"{MIN_CLUSTER_SIZE}. Near-best silhouette candidates were compared by cluster balance, and "
                f"this option kept the broadest pod smaller for clearer group differentiation."
                if len(close) > 1
                else f"k={selected['k']} produced the highest silhouette score among candidates meeting the "
                f"minimum cluster size threshold of {MIN_CLUSTER_SIZE}."
            )
    else:
        selected = best_overall
        reasoning = (
            f"No tested k satisfied the minimum cluster size threshold of {MIN_CLUSTER_SIZE}, so the "
            f"highest-silhouette solution k={selected['k']} was selected."
        )

    return selected["labels"], {
        "testedK": strip_candidate_metadata(candidates),
        "selectedK": selected["k"],
        "selectionReasoning": reasoning,
    }, candidates


def strip_candidate_metadata(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "k": candidate["k"],
            "silhouetteScore": candidate["silhouetteScore"],
            "clusterSizes": candidate["clusterSizes"],
            "minClusterSize": candidate["minClusterSize"],
            "maxClusterSize": candidate["maxClusterSize"],
            "passedMinSize": candidate["passedMinSize"],
        }
        for candidate in candidates
    ]


def cluster_profile_key(centroid_scores: dict[str, float]) -> tuple[str, str]:
    outdoors = centroid_scores["Hiking, Biking Running"]
    gaming = centroid_scores["Gaming"]
    books = centroid_scores["Reading and Discussing Books"]
    coffee = centroid_scores["Grabbing a coffee"]
    happy = centroid_scores["Going to a happy hour"]
    movies = centroid_scores["Going to the movies"]
    watch = centroid_scores["Going out to watch a game"]
    league = centroid_scores["Participating in an adult sports league"]
    nights = centroid_scores["Having an activities night"]

    if books >= 2.4 and coffee >= 2.6 and watch >= 2.5 and league < 2.1:
        return "Coffeehouse Connectors", "This pod mixes strong coffee-chat energy with thoughtful conversation and social plans that still feel easygoing."
    if happy >= 2.7 and watch >= 2.7 and outdoors >= 2.6 and league >= 2.4:
        return "Weekend Socializers", "This group is highly social across the board, especially around happy hours, active weekends, and shared outings."
    if happy >= 2.5 and watch >= 2.5 and coffee >= 2.4 and movies >= 2.2:
        return "All-Around Social", "This pod is broadly social, mixing happy hours, game days, coffee runs, and all-purpose group plans."
    if watch >= 2.3 and league >= 2.2 and happy >= 2.2:
        return "Sports-Centered Social", "This pod leans into game days, leagues, and outgoing group energy around sports."
    if outdoors >= 2.4 and league >= 2.2 and happy < 2.2:
        return "Active & Outdoors", "This group is most energized by movement, outdoor plans, and staying active together."
    if coffee >= 2.3 and books >= 1.8 and happy < 2.3:
        return "Low-Key & Conversational", "This pod favors calmer meetups, thoughtful conversation, and easy one-on-one connection."
    if gaming >= 1.8 and nights >= 2.1:
        return "Games & Hangouts", "This group is built around playful downtime, shared activities, and easy social nights."
    if movies >= 2.1 and happy >= 2.2:
        return "Movies & Mixed Social", "This pod blends nights out, entertainment, and casual social plans."
    if coffee >= 2.3 and happy >= 2.3:
        return "Laid-Back Social", "This group likes casual plans that can flex between coffee chats and more social nights."
    if nights >= 2.2 and coffee >= 2.0:
        return "Community Mixers", "This pod tends to connect through organized activities, shared plans, and easy group hangs."
    top_sorted = sorted(centroid_scores.items(), key=lambda item: (-item[1], ACTIVITY_COLUMNS.index(item[0])))
    top_labels = [ACTIVITY_SHORT[name] for name, _score in top_sorted[:2]]
    return f"{top_labels[0]} & {top_labels[1]}", f"This pod is anchored by {top_labels[0].lower()} and {top_labels[1].lower()} as its strongest shared preferences."


def make_unique_cluster_names(clusters: list[dict[str, Any]]) -> None:
    counts = Counter(cluster["podName"] for cluster in clusters)
    seen: Counter[str] = Counter()
    suffix_map = {
        "All-Around Social": ["Prime", "Plus", "Wide"],
        "Sports-Centered Social": ["League", "Game Day", "Crew"],
        "Active & Outdoors": ["Trail", "Motion", "Crew"],
        "Low-Key & Conversational": ["Circle", "Lounge", "Table"],
        "Games & Hangouts": ["Night", "Crew", "Club"],
        "Movies & Mixed Social": ["Cinema", "After Hours", "Club"],
        "Laid-Back Social": ["Coffeehouse", "After Work", "Commons"],
        "Community Mixers": ["Circle", "Commons", "Crew"],
    }
    for cluster in clusters:
        name = cluster["podName"]
        seen[name] += 1
        if counts[name] > 1:
            suffixes = suffix_map.get(name, ["North", "Central", "South"])
            suffix = suffixes[min(seen[name] - 1, len(suffixes) - 1)]
            cluster["podName"] = f"{name}: {suffix}"


def compute_coordinates(features: np.ndarray, labels: np.ndarray) -> np.ndarray:
    scaled = StandardScaler().fit_transform(features)
    pca = PCA(n_components=3, svd_solver="randomized", random_state=RANDOM_SEED)
    coords = pca.fit_transform(scaled)
    rng = np.random.default_rng(RANDOM_SEED)
    final_coords = np.zeros_like(coords, dtype=float)
    unique_labels = sorted(set(int(label) for label in labels))
    anchors = fibonacci_sphere_points(len(unique_labels), CLUSTER_ORBIT_RADIUS)
    anchor_map = {label: anchors[index] for index, label in enumerate(unique_labels)}

    for label in unique_labels:
        mask = labels == label
        cluster_coords = coords[mask]
        local_center = cluster_coords.mean(axis=0)
        local_offsets = cluster_coords - local_center
        local_max = float(np.max(np.abs(local_offsets))) or 1.0
        local_offsets = local_offsets / local_max * LOCAL_CLUSTER_SCALE
        jitter = rng.uniform(-JITTER_RANGE, JITTER_RANGE, size=local_offsets.shape)
        final_coords[mask] = local_offsets + jitter + anchor_map[label]

    coords = final_coords
    if not np.isfinite(coords).all():
        raise ValueError("PCA coordinates contain NaN or Inf values.")
    return coords


def serialize_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def build_outputs() -> dict[str, Any]:
    logging.info("Reading workbook from %s", EXCEL_PATH)
    df = load_dataframe()

    activity_matrix = df[ACTIVITY_COLUMNS].to_numpy(dtype=float)
    labels, cluster_evaluation, _candidates = discover_clusters(activity_matrix)
    coords = compute_coordinates(activity_matrix, labels)

    analysts: list[dict[str, Any]] = []
    for idx, row in df.reset_index(drop=True).iterrows():
        score_map = {activity: int(row[activity]) for activity in ACTIVITY_COLUMNS}
        top_activity_list = top_activities(score_map)
        persona = persona_from_profile(row[COLUMN_MAP["about_me"]], score_map, top_activity_list)
        instagram = str(row[COLUMN_MAP["instagram_username"]]).strip() if pd.notna(row[COLUMN_MAP["instagram_username"]]) else ""
        if instagram.lower() in {"n/a", "na", "none", ""}:
            instagram_value = None
        else:
            instagram_value = instagram
        analyst = {
            "id": idx,
            "name": f"{str(row[COLUMN_MAP['first_name']]).strip()} {str(row[COLUMN_MAP['last_name']]).strip()}".strip(),
            "office": str(row[COLUMN_MAP["office"]]).strip(),
            "email": str(row[COLUMN_MAP["email"]]).strip() if pd.notna(row[COLUMN_MAP["email"]]) else None,
            "phone": str(row[COLUMN_MAP["phone"]]).strip() if pd.notna(row[COLUMN_MAP["phone"]]) else None,
            "instagramUsername": instagram_value,
            "aboutMe": str(row[COLUMN_MAP["about_me"]]).strip() if pd.notna(row[COLUMN_MAP["about_me"]]) and str(row[COLUMN_MAP["about_me"]]).strip() else None,
            "personaTag": persona.persona_tag,
            "personaConfidence": persona.persona_confidence,
            "runnerUpPersona": persona.runner_up_persona,
            "topActivities": top_activity_list,
            "activityScores": score_map,
            "clusterId": int(labels[idx]),
            "coordinates": {
                "x": round(float(coords[idx, 0]), 4),
                "y": round(float(coords[idx, 1]), 4),
                "z": round(float(coords[idx, 2]), 4),
            },
            "slug": slugify(f"{idx}-{str(row[COLUMN_MAP['first_name']]).strip()}-{str(row[COLUMN_MAP['last_name']]).strip()}"),
        }
        analysts.append(analyst)

    activity_matrix_int = np.array([[analyst["activityScores"][activity] for activity in ACTIVITY_COLUMNS] for analyst in analysts], dtype=float)
    for analyst in analysts:
        current = activity_matrix_int[analyst["id"]]
        distances = []
        for other in analysts:
            if other["id"] == analyst["id"]:
                continue
            other_scores = activity_matrix_int[other["id"]]
            distance = float(np.linalg.norm(current - other_scores))
            same_cluster_bonus = 0.0 if other["clusterId"] == analyst["clusterId"] else 0.35
            distances.append((distance + same_cluster_bonus, other["id"]))
        distances.sort(key=lambda item: (item[0], item[1]))
        analyst["closestMatches"] = [other_id for _distance, other_id in distances[:5]]

    clusters: list[dict[str, Any]] = []
    for cluster_id in sorted(set(int(label) for label in labels)):
        member_ids = [analyst["id"] for analyst in analysts if analyst["clusterId"] == cluster_id]
        cluster_scores = np.array([[analyst["activityScores"][activity] for activity in ACTIVITY_COLUMNS] for analyst in analysts if analyst["clusterId"] == cluster_id], dtype=float)
        centroid = cluster_scores.mean(axis=0)
        centroid_scores = {activity: round(float(centroid[idx]), 4) for idx, activity in enumerate(ACTIVITY_COLUMNS)}
        top_cluster_activities = [activity for activity, _score in sorted(centroid_scores.items(), key=lambda item: (-item[1], ACTIVITY_COLUMNS.index(item[0])))[:3]]
        unanimous = []
        for idx, activity in enumerate(ACTIVITY_COLUMNS):
            if np.all(cluster_scores[:, idx] == 3):
                unanimous.append(activity)
        fallback_shared = len(unanimous) < 2
        common_ground = unanimous[:2]
        if fallback_shared:
            for activity in top_cluster_activities:
                if activity not in common_ground:
                    common_ground.append(activity)
                if len(common_ground) == 2:
                    break
        pod_name, short_vibe = cluster_profile_key(centroid_scores)
        cluster = {
            "id": cluster_id,
            "podName": pod_name,
            "shortVibe": short_vibe,
            "memberCount": len(member_ids),
            "centroidScores": centroid_scores,
            "topClusterActivities": top_cluster_activities,
            "commonGround": common_ground,
            "fallbackSharedInterests": fallback_shared,
            "members": member_ids,
        }
        clusters.append(cluster)

    make_unique_cluster_names(clusters)
    cluster_lookup = {cluster["id"]: cluster for cluster in clusters}
    for analyst in analysts:
        analyst["podName"] = cluster_lookup[analyst["clusterId"]]["podName"]
        analyst["shortVibe"] = cluster_lookup[analyst["clusterId"]]["shortVibe"]

    network_map = {
        "analysts": analysts,
        "clusters": clusters,
        "clusterEvaluation": cluster_evaluation,
        "metadata": {
            "totalAnalysts": len(analysts),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceWorkbook": str(EXCEL_PATH),
        },
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    serialize_json(OUTPUT_DIR / "analysts.json", analysts)
    serialize_json(OUTPUT_DIR / "clusters.json", clusters)
    serialize_json(OUTPUT_DIR / "cluster-evaluation.json", cluster_evaluation)
    serialize_json(OUTPUT_DIR / "network-map.json", network_map)
    serialize_json(FRONTEND_DATA_PATH, network_map)
    logging.info("Wrote outputs to %s and synced frontend payload to %s", OUTPUT_DIR, FRONTEND_DATA_PATH)
    return network_map


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    build_outputs()


if __name__ == "__main__":
    main()
