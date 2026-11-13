final class ProfileConfig {
  // SHA256 id IDE, привязанных к профилю.
  final List<String> idMashines;
  // id профиля
  final String id;
  // название профиля
  final String title;
  // id активного проекта
  final String idActiveProject;

  ProfileConfig({
    required this.idMashines,
    required this.id,
    required this.title,
    required this.idActiveProject,
  });

  Map<String, dynamic> toJson() {
    return {
      'idMashines': idMashines,
      'id': id,
      'title': title,
      'idActiveProject': idActiveProject,
    };
  }
}

final class SidebarConfig {
  final bool bottom;
  final bool left;
  final bool right;

  SidebarConfig({required this.bottom, required this.left, required this.right});

  Map<String, dynamic> toJson() {
    return {'bottom': bottom, 'left': left, 'right': right};
  }
}

final class PageLayoutPrefs {
  final String layout;
  final String groupsLayout;

  PageLayoutPrefs({required this.layout, required this.groupsLayout});

  Map<String, dynamic> toJson() {
    return {'layout': layout, 'groupsLayout': groupsLayout};
  }
}

final class AppearanceConfig {
  final double fontGroup;
  final double fontSubgroup;
  final double fontFolder;
  final double fontFile;
  final double fontScale;
  final double gradientDirection;
  final bool cardGradient;
  final double cardFill;
  final double cardBorder;
  final double bgFolder;
  final double bgFile;
  final double bgSubgroup;
  final double bgClass;
  final double bgNote;
  final double bgHover;
  final double labelSaturation;
  final bool openFileMark;
  final bool showErrorIcon;
  final bool openFileAnimate;
  final double openFileDuration;
  final bool showProblemsTab;
  final bool cyclePageScroll;
  final bool openLinksInCursor;
  final bool problemsError;
  final bool problemsWarning;
  final bool problemsInfo;
  final String language;
  final int reviewRefreshSec;
  final int projectFetchSec;
  final int filesFetchSec;
  final int notesFetchSec;
  final int linksFetchSec;

  AppearanceConfig({
    required this.fontGroup,
    required this.fontSubgroup,
    required this.fontFolder,
    required this.fontFile,
    required this.fontScale,
    required this.gradientDirection,
    required this.cardGradient,
    required this.cardFill,
    required this.cardBorder,
    required this.bgFolder,
    required this.bgFile,
    required this.bgSubgroup,
    required this.bgClass,
    required this.bgNote,
    required this.bgHover,
    required this.labelSaturation,
    required this.openFileMark,
    required this.showErrorIcon,
    required this.openFileAnimate,
    required this.openFileDuration,
    required this.showProblemsTab,
    required this.cyclePageScroll,
    required this.openLinksInCursor,
    required this.problemsError,
    required this.problemsWarning,
    required this.problemsInfo,
    required this.language,
    required this.reviewRefreshSec,
    required this.projectFetchSec,
    required this.filesFetchSec,
    required this.notesFetchSec,
    required this.linksFetchSec,
  });

  factory AppearanceConfig.init() {
    return AppearanceConfig(
      fontGroup: 1.15,
      fontSubgroup: 1.05,
      fontFolder: 0.95,
      fontFile: 0.9,
      fontScale: 1,
      gradientDirection: 0,
      cardGradient: true,
      cardFill: 9,
      cardBorder: 55,
      bgFolder: 4,
      bgFile: 5,
      bgSubgroup: 0,
      bgClass: 8,
      bgNote: 0,
      bgHover: 10,
      labelSaturation: 20,
      openFileMark: true,
      showErrorIcon: true,
      openFileAnimate: true,
      openFileDuration: 1,
      showProblemsTab: true,
      cyclePageScroll: true,
      openLinksInCursor: false,
      problemsError: true,
      problemsWarning: true,
      problemsInfo: true,
      language: 'ru',
      reviewRefreshSec: 30,
      projectFetchSec: 15,
      filesFetchSec: 60,
      notesFetchSec: 60,
      linksFetchSec: 60,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'fontGroup': fontGroup,
      'fontSubgroup': fontSubgroup,
      'fontFolder': fontFolder,
      'fontFile': fontFile,
      'fontScale': fontScale,
      'gradientDirection': gradientDirection,
      'cardGradient': cardGradient,
      'cardFill': cardFill,
      'cardBorder': cardBorder,
      'bgFolder': bgFolder,
      'bgFile': bgFile,
      'bgSubgroup': bgSubgroup,
      'bgClass': bgClass,
      'bgNote': bgNote,
      'bgHover': bgHover,
      'labelSaturation': labelSaturation,
      'openFileMark': openFileMark,
      'showErrorIcon': showErrorIcon,
      'openFileAnimate': openFileAnimate,
      'openFileDuration': openFileDuration,
      'showProblemsTab': showProblemsTab,
      'cyclePageScroll': cyclePageScroll,
      'openLinksInCursor': openLinksInCursor,
      'problemsError': problemsError,
      'problemsWarning': problemsWarning,
      'problemsInfo': problemsInfo,
      'language': language,
      'reviewRefreshSec': reviewRefreshSec,
      'projectFetchSec': projectFetchSec,
      'filesFetchSec': filesFetchSec,
      'notesFetchSec': notesFetchSec,
      'linksFetchSec': linksFetchSec,
    };
  }
}

final class ProfileProfilingConfig {
  final String id;
  final String? githubNick;
  final String? gitlabNick;
  // Случайный id. Токен хоста лежит в SecretStorage IDE под этим ключом.
  final String? repositoryTokenKey;
  final SidebarConfig sidebar;
  final AppearanceConfig appearance;
  final Map<String, PageLayoutPrefs>? pageLayouts;
  final String? reviewSkillPath;
  final String? reviewDirPath;
  final String? reviewModel;
  final String? reviewFixModel;

  ProfileProfilingConfig({
    required this.id,
    this.githubNick,
    this.gitlabNick,
    this.repositoryTokenKey,
    required this.sidebar,
    required this.appearance,
    this.pageLayouts,
    this.reviewSkillPath,
    this.reviewDirPath,
    this.reviewModel,
    this.reviewFixModel,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      if (githubNick != null) 'githubNick': githubNick,
      if (gitlabNick != null) 'gitlabNick': gitlabNick,
      if (repositoryTokenKey != null) 'repositoryTokenKey': repositoryTokenKey,
      'sidebar': sidebar.toJson(),
      'appearance': appearance.toJson(),
      if (pageLayouts != null)
        'pageLayouts': pageLayouts!.map((key, value) => MapEntry(key, value.toJson())),
      if (reviewSkillPath != null) 'reviewSkillPath': reviewSkillPath,
      if (reviewDirPath != null) 'reviewDirPath': reviewDirPath,
      if (reviewModel != null) 'reviewModel': reviewModel,
      if (reviewFixModel != null) 'reviewFixModel': reviewFixModel,
    };
  }
}
