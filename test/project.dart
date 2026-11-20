import 'profile.dart';

final class ProjectPageEntry {
  final String name;
  final String kind;
  final int order;
  final String? description;

  ProjectPageEntry({
    required this.name,
    required this.kind,
    required this.order,
    this.description,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'kind': kind,
      'order': order,
      if (description != null) 'description': description,
    };
  }
}

final class ProjectLock {
  final String profileId;

  ProjectLock({required this.profileId});

  Map<String, dynamic> toJson() => {'profileId': profileId};
}

final class ProjectConfig {
  final String id;
  final String title;
  final String host;
  final String repository;
  // keys: files | notes | links | review — появляются при создании страницы.
  final Map<String, String> dChannels;
  final List<ProfileProfilingConfig> profiling;
  final Map<String, ProjectPageEntry> pages;
  final ProjectLock? lock;

  ProjectConfig({
    required this.id,
    required this.title,
    required this.host,
    required this.repository,
    required this.dChannels,
    required this.profiling,
    required this.pages,
    this.lock,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'host': host,
      'repository': repository,
      'dChannels': dChannels,
      'profiling': profiling.map((item) => item.toJson()).toList(),
      'pages': pages.map((key, value) => MapEntry(key, value.toJson())),
      if (lock != null) 'lock': lock!.toJson(),
    };
  }
}
